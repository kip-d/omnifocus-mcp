export {}; // Make this a module so declare module works as augmentation

declare module 'eslint' {
  namespace RuleTester {
    let afterAll: ((...args: any) => any) | null;
  }
}
