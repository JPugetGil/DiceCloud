process.on('unhandledRejection', (error, p) => {
  console.dir((error as Error)?.stack);
  console.error('Unhandled Rejection at:', p, 'reason:', error)
  process.exit(1)
});