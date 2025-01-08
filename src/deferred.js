export class DeferredCallback extends Promise {
  /**
   * @param {{ (): void; (): void; (): void; (arg0: (value: any) => void, arg1: (reason?: any) => void): void; }} callback
   */
  constructor(callback) {
    let res, rej;
    super(function resolver(resolve, reject) {
      callback(resolve, reject);
      res = resolve;
      rej = reject;
    });
    /**
     * @type {(arg0: any) => any}
     */
    this.resolve = res;
    /**
     * @type {(arg0: any) => any}
     */
    this.reject = rej;

    const that = this;
    /**
     *
     * @param {Error} err
     * @param {any} result
     */
    this.callback = function myCallback(err, result) {
      if (err) return that.reject(err);
      return that.resolve(result);
    };
  }
}
