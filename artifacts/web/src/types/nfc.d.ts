interface NDEFRecord {
  readonly recordType: string;
  readonly mediaType?: string;
  readonly id?: string;
  readonly data?: DataView;
  readonly encoding?: string;
  readonly lang?: string;
}

interface NDEFMessage {
  readonly records: ReadonlyArray<NDEFRecord>;
}

interface NDEFReadingEvent extends Event {
  readonly serialNumber: string;
  readonly message: NDEFMessage;
}

interface NDEFScanOptions {
  signal?: AbortSignal;
}

interface NDEFReader extends EventTarget {
  scan(options?: NDEFScanOptions): Promise<void>;
  addEventListener(type: "reading", listener: (event: NDEFReadingEvent) => void): void;
  addEventListener(type: "readingerror", listener: (event: Event) => void): void;
  removeEventListener(type: "reading", listener: (event: NDEFReadingEvent) => void): void;
  removeEventListener(type: "readingerror", listener: (event: Event) => void): void;
}

declare var NDEFReader: {
  new (): NDEFReader;
  prototype: NDEFReader;
};
