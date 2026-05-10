// Public image and download metadata now lives in CMS-managed database tables.
// Static files remain under /public, but public pages should read records from the CMS.
export type NdccImageAsset = {
  title: string;
  alt: string;
  src: string;
  width: number;
  height: number;
  sourceFile: string;
  sourceBytes: number;
  optimizedBytes: number;
};

export type NdccDownloadAsset = {
  title: string;
  href: string;
  sourceFile: string;
  bytes: number;
};
