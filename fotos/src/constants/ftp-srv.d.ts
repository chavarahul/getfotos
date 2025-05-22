declare module "ftp-srv" {
  interface FtpServerOptions {
    url: string;
    anonymous?: boolean;
    pasv_range?: string;
    pasv_url?: string;
    greeting?: string[];
  }

  interface FtpConnection {
    id: string;
  }

  interface FtpLoginResult {
    root: string;
  }

  class FtpSrv {
    constructor(options: FtpServerOptions);
    on(
      event: "login",
      handler: (
        data: { connection: FtpConnection; username: string; password: string },
        resolve: (result: FtpLoginResult) => void,
        reject: (error: Error) => void
      ) => void
    ): this;
    listen(): Promise<void>;
    close(): Promise<void>;
  }

  export = FtpSrv;
}