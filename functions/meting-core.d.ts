declare module "@meting/core" {
  export default class Meting {
    constructor(source?: string);
    format(enabled?: boolean): this;
    song(id: string): Promise<string>;
    pic(id: string, size?: number): Promise<string>;
    url(id: string, bitrate?: number): Promise<string>;
  }
}
