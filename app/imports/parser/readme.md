# The formula grammar

`grammar.js` is generated from `grammar.ne` by nearley's compiler, one of the
app's dependencies. After changing `grammar.ne`, from `app/`:

```sh
meteor npx nearleyc imports/parser/grammar.ne -o imports/parser/grammar.js
```

then commit both files. The build does not compile `.ne` files itself: that
would take a build plugin. Neither ESLint nor the type check reads the
generated file; `grammar.d.ts` declares what it exports.
