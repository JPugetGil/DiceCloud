// https://github.com/VeliovGroup/Meteor-Files/blob/master/docs/aws-s3-integration.md
import { Meteor } from 'meteor/meteor';
import { each, clone } from 'lodash';
import { Random } from 'meteor/random';
import { FileObj, FileRef, FilesCollection, FilesCollectionConfig } from 'meteor/ostrio:files';
import stream from 'stream';
import { S3 } from '@aws-sdk/client-s3';

/* See fs-extra and graceful-fs NPM packages */
/* For better i/o performance */
import fs from 'fs';
import { promises as fsp } from 'fs';

/*
 * Files go to AWS S3 when the settings hold an access key, its secret and a
 * bucket, in Paris (eu-west-3) unless `region` names another AWS region.
 * `endpoint` is only for an S3-compatible service other than AWS.
 * Example: S3='{"s3":{"key": "xxx", "secret": "xxx", "bucket": "xxx"}}' meteor
 */
if (process.env.S3) {
  Meteor.settings.s3 = JSON.parse(process.env.S3).s3;
}

const s3Conf = Meteor.settings.s3 || {};
Meteor.settings.useS3 = !!(
  s3Conf && s3Conf.key && s3Conf.secret && s3Conf.bucket
);
// The client marks files that never reached S3 (isMissingFromStorage)
Meteor.settings.public.useS3 = Meteor.settings.useS3;

const bound = Meteor.bindEnvironment((callback: () => any) => {
  return callback();
});

let createS3FilesCollection;

type S3Metadata = {
  pipePath: string,
}

type S3FilesCollection = FilesCollection<S3Metadata> & {
  readJSONFile?: (file: FileObj<S3Metadata>) => Promise<any>
};

/* Check settings existence in `Meteor.settings` */
/* This is the best practice for app security */
if (Meteor.settings.useS3) {
  // Create a new S3 object
  const s3 = new S3({
    credentials: {
      accessKeyId: s3Conf.key,
      secretAccessKey: s3Conf.secret,
    },
    region: s3Conf.region || 'eu-west-3',
    ...(s3Conf.endpoint && { endpoint: s3Conf.endpoint, forcePathStyle: true }),
    tls: true,
    maxAttempts: 10,
  });

  createS3FilesCollection = function ({
    collectionName,
    storagePath,
    onBeforeUpload,
    onAfterUpload,
    debug,// = !Meteor.isProduction,
    allowClientCode = false,
  }: {
    collectionName: string,
    storagePath: string,
    onBeforeUpload: (...args: any[]) => any,
    onAfterUpload: (...args: any[]) => any,
    debug: boolean,
    allowClientCode?: boolean,
  }) {
    const filesCollection: S3FilesCollection = new FilesCollection<S3Metadata>({
      collectionName,
      storagePath,
      onBeforeUpload,
      onAfterUpload(fileRef) {
        // Call the provided afterUpload hook first
        onAfterUpload?.(fileRef);

        // Start moving files to AWS:S3
        // after fully received by the Meteor server

        // Run through each of the uploaded file
        each(fileRef.versions, (vRef, version) => {
          // We use Random.id() instead of real file's _id
          // to secure files from reverse engineering on the AWS client
          const filePath = 'files/' + (Random.id()) + '-' + version + '.' + fileRef.extension;

          // Create the AWS:S3 object.
          // Feel free to change the storage class from, see the documentation,
          // `STANDARD_IA` is the best deal for low access files.
          // Key is the file name we are creating on AWS:S3, so it will be like files/XXXXXXXXXXXXXXXXX-original.XXXX
          // Body is the file stream we are sending to AWS
          s3.putObject({
            // ServerSideEncryption: 'AES256', // Optional
            StorageClass: 'STANDARD',
            Bucket: s3Conf.bucket,
            Key: filePath,
            Body: fs.createReadStream(vRef.path),
            ContentType: vRef.type,
          }, (error: Error) => {
            bound(async () => {
              if (error) {
                this.emit('s3Result', error, fileRef);
                return console.error(error);
              }
              // Update FilesCollection with link to the file at AWS
              // any should actually be Mongo.Modifier<FileObj<S3Metadata>>, but the types aren't quite set up
              // Right for mongo modifiers on version.meta
              const upd: any = {
                $set: {
                  [`versions.${version}.meta.pipePath`]: filePath
                }
              };

              // Awaited: Meteor 3's updateAsync ignores a callback, which
              // left every uploaded file on the server's disk and never
              // announced the result (archiving waited for it forever)
              try {
                await filesCollection.collection.updateAsync({ _id: fileRef._id }, upd);
              } catch (updError) {
                this.emit('s3Result', updError, fileRef);
                return console.error(updError);
              }
              // Unlink original files from FS after successful upload to AWS:S3
              filesCollection.unlink(await filesCollection.findOneAsync(fileRef._id), version);
              this.emit('s3Result', undefined, fileRef);
            });
          });
        });
      },
      interceptDownload(http: any, fileRef: FileRef<S3Metadata>, version: string) {
        // Intercept access to the file
        // And redirect request to AWS:S3
        let path;

        if (fileRef?.versions?.[version]?.meta?.pipePath) {
          path = fileRef.versions[version].meta.pipePath;
        }

        if (path) {
          // If file is successfully moved to AWS:S3
          // We will pipe request to AWS:S3
          // So, original link will stay always secure

          // To force ?play and ?download parameters
          // and to keep original file name, content-type,
          // content-disposition, chunked "streaming" and cache-control
          // we're using low-level .serve() method
          const opts: Parameters<typeof s3.getObject>[0] = {
            Bucket: s3Conf.bucket,
            Key: path
          };

          if (http.request.headers.range) {
            const vRef = fileRef.versions[version];
            const range = clone(http.request.headers.range);
            const array = range.split(/bytes=([0-9]*)-([0-9]*)/);
            const start = parseInt(array[1]);
            let end = parseInt(array[2]);
            if (isNaN(end)) {
              // Request data from AWS:S3 by small chunks
              end = (start + (this.chunkSize || 0)) - 1;
              if (end >= vRef.size) {
                end = vRef.size - 1;
              }
            }
            opts.Range = `bytes=${start}-${end}`;
            http.request.headers.range = `bytes=${start}-${end}`;
          }

          // The promise form: the callback form came from AWS SDK v2, whose
          // response was `this` in the callback. Under v3 `this` is
          // undefined, the SDK swallowed the resulting error, and every
          // download hung.
          s3.getObject(opts).then(({ Body, ContentRange }) => {
            if (http.request.headers.range && ContentRange) {
              // Set proper range header in according to what is returned from AWS:S3
              http.request.headers.range = ContentRange.split('/')[0].replace('bytes ', 'bytes=');
            }
            const body = Body as stream.Readable;
            // Release S3's connection when the browser leaves before the end
            http.response.on('close', () => body.destroy());
            this.serve(http, fileRef, fileRef.versions[version], version, body);
          }).catch((error) => {
            console.error('Error getting s3 object', opts, error);
            if (!http.response.finished) {
              http.response.end();
            }
          });

          return true;
        }
        // While file is not yet uploaded to AWS:S3
        // It will be served file from FS
        return false;
      },
      debug,
      allowClientCode,
    });
    // Intercept FilesCollection's removeAsync to remove file from AWS:S3.
    // ostrio:files 3 does not route removeAsync through remove(), and the app
    // only calls removeAsync, so intercepting remove() never ran.
    const _origRemoveAsync = filesCollection.removeAsync;
    filesCollection.removeAsync = async function (search) {
      const cursor = this.collection.find(search);
      await cursor.forEachAsync((fileRef) => {
        each(fileRef.versions, (vRef) => {
          if (vRef?.meta?.pipePath) {
            // Remove the object from AWS:S3 first, then we will call the original FilesCollection remove
            s3.deleteObject({
              Bucket: s3Conf.bucket,
              Key: vRef.meta.pipePath,
            }, (error: any) => {
              bound(() => {
                if (error) {
                  console.error(error);
                }
              });
            });
          }
        });
      });

      //remove original file from database
      return _origRemoveAsync.call(this, search);
    };

    filesCollection.readJSONFile = async function (file: FileObj<S3Metadata>) {
      // If there is the pipepath, use s3 to get the file
      if (file?.versions?.original?.meta?.pipePath) {
        const path = file.versions.original.meta.pipePath;
        const data = await s3.getObject({
          Bucket: s3Conf.bucket,
          Key: path
        });
        if (!data.Body) return;
        return JSON.parse(await data.Body.transformToString());
      } else {
        // Otherwise use the normal filesystem
        const fileString = await fsp.readFile(file.path, 'utf8');
        return JSON.parse(fileString);
      }
    };

    return filesCollection;
  }
} else {
  createS3FilesCollection = function ({
    collectionName,
    storagePath,
    onBeforeUpload,
    onAfterUpload,
    debug,// = !Meteor.isProduction,
    allowClientCode = false,
  }: FilesCollectionConfig<S3Metadata>) {
    const collection: S3FilesCollection = new FilesCollection<S3Metadata>({
      collectionName,
      storagePath,
      onBeforeUpload,
      onAfterUpload,
      debug,
      allowClientCode,
    });

    // Use the normal file system to read files
    collection.readJSONFile = async function (file) {
      const fileString = await fsp.readFile(file.path, 'utf8');
      return JSON.parse(fileString);
    };

    return collection;
  }
}

export { createS3FilesCollection };
