declare namespace NodeJS {
  interface Global {
    __vorpal: {
      ui: {
        exists: boolean;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        exports?: any;
      };
    };
  }
}
