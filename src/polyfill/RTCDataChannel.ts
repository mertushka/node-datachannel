/* eslint-disable @typescript-eslint/no-explicit-any */
import * as exceptions from './Exception';
import { DataChannel } from '../lib/index';
import { RTCErrorEvent } from './Events';

export default class RTCDataChannel extends EventTarget implements globalThis.RTCDataChannel {
  #dataChannel: DataChannel;
  #readyState: globalThis.RTCDataChannelState;
  #bufferedAmountLowThreshold: number;
  #binaryType: BinaryType;
  #maxPacketLifeTime: number | null;
  #maxRetransmits: number | null;
  #negotiated: boolean;
  #ordered: boolean;
  #id: number;
  #label: string;
  #protocol: string;

  #closeRequested = false;

  // events
  onbufferedamountlow: globalThis.RTCDataChannel['onbufferedamountlow'] = null;
  onclose: globalThis.RTCDataChannel['onclose'] = null;
  onclosing: globalThis.RTCDataChannel['onclosing'] = null;
  onerror: globalThis.RTCDataChannel['onerror'] = null;
  onmessage: globalThis.RTCDataChannel['onmessage'] = null;
  onopen: globalThis.RTCDataChannel['onopen'] = null;

  constructor(dataChannel: DataChannel, opts: globalThis.RTCDataChannelInit = {}) {
    super();

    this.#dataChannel = dataChannel;
    this.#binaryType = 'blob';
    this.#readyState = this.#dataChannel.isOpen() ? 'open' : 'connecting';
    this.#bufferedAmountLowThreshold = 0;
    this.#maxPacketLifeTime = opts.maxPacketLifeTime ?? null;
    this.#maxRetransmits = opts.maxRetransmits ?? null;
    this.#negotiated = opts.negotiated ?? false;
    this.#ordered = opts.ordered ?? true;
    this.#id = this.#dataChannel.getId();
    this.#label = this.#dataChannel.getLabel();
    this.#protocol = this.#dataChannel.getProtocol();

    // forward dataChannel events
    this.#dataChannel.onOpen(() => {
      this.#readyState = 'open';
      this.dispatchEvent(new Event('open', {}));
    });

    this.#dataChannel.onClosed(() => {
      if (this.#readyState === 'closed') return;

      if (!this.#closeRequested) {
        // if close was not requested (network failure etc.), we emit 'closing' before 'close' to match the spec behavior
        this.#readyState = 'closing';
        this.dispatchEvent(new Event('closing'));

        setImmediate(() => {
          if (this.#readyState !== 'closed') {
            this.#readyState = 'closed';
            this.dispatchEvent(new Event('close'));
          }
        });
      } else {
        // if close was requested, we emit 'close' immediately
        this.#readyState = 'closed';
        this.dispatchEvent(new Event('close'));
      }
    });

    this.#dataChannel.onError((msg) => {
      this.dispatchEvent(
        new RTCErrorEvent('error', {
          error: new RTCError(
            {
              errorDetail: 'data-channel-failure',
            },
            msg,
          ),
        }),
      );
    });

    this.#dataChannel.onBufferedAmountLow(() => {
      this.dispatchEvent(new Event('bufferedamountlow'));
    });

    this.#dataChannel.onMessage((data) => {
      if (ArrayBuffer.isView(data)) {
        data =
          this.binaryType === 'arraybuffer'
            ? (data.buffer as ArrayBuffer)
            : Buffer.from(data.buffer);
      }

      this.dispatchEvent(new MessageEvent('message', { data }));
    });

    // forward events to properties
    this.addEventListener('open', (e) => this.onopen?.(e));
    this.addEventListener('message', (e) => this.onmessage?.(e as MessageEvent));
    this.addEventListener('error', (e) => this.onerror?.(e as RTCErrorEvent));
    this.addEventListener('close', (e) => this.onclose?.(e));
    this.addEventListener('closing', (e) => this.onclosing?.(e));
    this.addEventListener('bufferedamountlow', (e) => this.onbufferedamountlow?.(e));
  }

  set binaryType(type) {
    if (type !== 'blob' && type !== 'arraybuffer') {
      throw new DOMException(
        "Failed to set the 'binaryType' property on 'RTCDataChannel': Unknown binary type : " +
          type,
        'TypeMismatchError',
      );
    }
    this.#binaryType = type;
  }

  get binaryType(): BinaryType {
    return this.#binaryType;
  }

  get bufferedAmount(): number {
    return this.#dataChannel.bufferedAmount();
  }

  get bufferedAmountLowThreshold(): number {
    return this.#bufferedAmountLowThreshold;
  }

  set bufferedAmountLowThreshold(value) {
    const number = Number(value) || 0;
    this.#bufferedAmountLowThreshold = number;
    this.#dataChannel.setBufferedAmountLowThreshold(number);
  }

  get id(): number | null {
    return this.#id;
  }

  get label(): string {
    return this.#label;
  }

  get maxPacketLifeTime(): number | null {
    return this.#maxPacketLifeTime;
  }

  get maxRetransmits(): number | null {
    return this.#maxRetransmits;
  }

  get negotiated(): boolean {
    return this.#negotiated;
  }

  get ordered(): boolean {
    return this.#ordered;
  }

  get protocol(): string {
    return this.#protocol;
  }

  get readyState(): globalThis.RTCDataChannelState {
    return this.#readyState;
  }

  send(data: string | Blob | ArrayBuffer | ArrayBufferView): void {
    if (this.#readyState !== 'open') {
      if (process.env.DATACHANNEL_SEND_DEBUG === 'true') {
        console.error(
          new exceptions.InvalidStateError(
            "Failed to execute 'send' on 'RTCDataChannel': RTCDataChannel.readyState is not 'open'",
          ),
        );
      }
      return;
    }

    // Needs network error, type error implemented
    try {
      if (typeof data === 'string') {
        this.#dataChannel.sendMessage(data);
      } else if (data instanceof Blob) {
        data.arrayBuffer().then((ab) => {
          if (process?.versions?.bun) {
            this.#dataChannel.sendMessageBinary(Buffer.from(ab));
          } else {
            this.#dataChannel.sendMessageBinary(new Uint8Array(ab));
          }
        });
      } else if (data instanceof Uint8Array) {
        this.#dataChannel.sendMessageBinary(data);
      } else {
        if (process?.versions?.bun) {
          this.#dataChannel.sendMessageBinary(Buffer.from(data as ArrayBuffer));
        } else {
          this.#dataChannel.sendMessageBinary(new Uint8Array(data as ArrayBuffer));
        }
      }
    } catch (error) {
      //If error contains "DataChannel is closed" throw InvalidStateError
      if (error instanceof Error && error?.message?.includes('DataChannel is closed')) {
        // @ts-expect-error i-hate-ts
        if (this.#readyState !== 'closed') {
          this.#readyState = 'closed';
          this.dispatchEvent(new Event('close'));
        }
        if (process.env.DATACHANNEL_SEND_DEBUG === 'true') {
          console.error(
            new exceptions.InvalidStateError(
              "Failed to execute 'send' on 'RTCDataChannel': RTCDataChannel is not 'open'",
            ),
          );
        }
      } else {
        // Otherwise re-throw the error
        if (process.env.DATACHANNEL_SEND_DEBUG === 'true') {
          console.error(error);
        }
      }
    }
  }

  close(): void {
    if (this.#readyState === 'closing' || this.#readyState === 'closed') return;

    this.#closeRequested = true;
    this.#readyState = 'closing';

    setImmediate(() => {
      this.#dataChannel.close();
    });
  }

  _forceCloseAbruptly(): void {
    if (this.#readyState === 'closing' || this.#readyState === 'closed') return;
    this.#readyState = 'closed';
    this.dispatchEvent(new Event('close'));
  }
}
