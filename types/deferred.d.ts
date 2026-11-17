export class DeferredCallback extends Promise<any> {
    /**
     * @param {{ (): void; (): void; (): void; (arg0: (value: any) => void, arg1: (reason?: any) => void): void; }} callback
     */
    constructor(callback: {
        (): void;
        (): void;
        (): void;
        (arg0: (value: any) => void, arg1: (reason?: any) => void): void;
    });
    /**
     * @type {(arg0: any) => any}
     */
    resolve: (arg0: any) => any;
    /**
     * @type {(arg0: any) => any}
     */
    reject: (arg0: any) => any;
    /**
     *
     * @param {Error} err
     * @param {any} result
     */
    callback: (err: Error, result: any) => any;
}
//# sourceMappingURL=deferred.d.ts.map