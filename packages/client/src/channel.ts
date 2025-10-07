import { EventCallback, ChannelType, PresenceMember, PresenceChannelData, LatteStreamOptions } from './types';
import { FastEventEmitter, ObjectPool } from './performance';

export abstract class Channel {
  protected eventEmitter = new FastEventEmitter();
  protected subscribed = false;

  constructor(
    public readonly name: string,
    protected send: (data: any) => boolean,
    public readonly options: LatteStreamOptions
  ) {}

  abstract getType(): ChannelType;

  bind(eventName: string, callback: EventCallback): void {
    this.eventEmitter.on(eventName, callback);
  }

  unbind(eventName?: string, callback?: EventCallback): void {
    if (!eventName) {
      this.eventEmitter.clear();
      return;
    }
    this.eventEmitter.off(eventName, callback);
  }

  trigger(eventName: string, data?: any): boolean {
    this.log(
      `[LatteStream Channel] trigger called for ${this.name}, subscribed: ${this.subscribed}, event: ${eventName}`
    );
    if (!this.subscribed) {
      this.log(`[LatteStream Channel] trigger failed - channel ${this.name} not subscribed`);
      return false;
    }

    this.log(`[LatteStream Channel] trigger sending message for ${this.name}:`, {
      event: eventName,
      data: data,
      channel: this.name,
    });

    return this.send({
      event: eventName,
      data: data,
      channel: this.name,
    });
  }

  protected log(...args: any[]) {
    if (this.options.enableLogging) {
      console.log(...args);
    }
  }

  protected parseEventData(data: any): any {
    // If data is a string that looks like JSON, parse it
    if (typeof data === 'string') {
      const trimmed = data.trim();
      if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
        try {
          const parsed = JSON.parse(data);
          this.log(`[LatteStream Channel] Parsed JSON data for ${this.name}:`, parsed);
          return parsed;
        } catch (error) {
          this.log(`[LatteStream Channel] Failed to parse JSON data for ${this.name}:`, error);
          return data;
        }
      }
    }

    return data;
  }

  handleEvent(eventName: string, data?: any): void {
    const parsedData = this.parseEventData(data);
    this.log(`[LatteStream Channel] Emitting event '${eventName}' on channel '${this.name}' with data:`, parsedData);
    this.eventEmitter.emit(eventName, parsedData);
  }

  subscribe(socketId?: string): void | Promise<void> {
    if (this.subscribed) return;

    const sent = this.send({
      event: 'lattestream:subscribe',
      data: {
        channel: this.name,
      },
    });

    if (sent) {
      this.log(`[LatteStream Channel] Sent subscription for ${this.name}`);
    } else {
      this.log(`[LatteStream Channel] Failed to send subscription for ${this.name} - connection not ready`);
    }
  }

  unsubscribe(): void {
    if (!this.subscribed) return;

    this.send({
      event: 'lattestream:unsubscribe',
      data: {
        channel: this.name,
      },
    });

    this.subscribed = false;
  }

  handleSubscriptionSucceeded(data?: any): void {
    this.log(`[LatteStream Channel] handleSubscriptionSucceeded called for ${this.name}, setting subscribed = true`);
    this.subscribed = true;
    this.handleEvent('lattestream:subscription_succeeded', data);
  }

  handleSubscriptionError(error: any): void {
    this.handleEvent('lattestream:subscription_error', error);
  }

  isSubscribed(): boolean {
    return this.subscribed;
  }
}

export class PublicChannel extends Channel {
  getType(): ChannelType {
    return 'public';
  }
}

export class PrivateChannel extends Channel {
  constructor(
    name: string,
    send: (data: any) => boolean,
    protected authorize: (channelName: string, socketId: string) => Promise<string>,
    options: LatteStreamOptions = {}
  ) {
    super(name, send, options);
  }

  getType(): ChannelType {
    return 'private';
  }

  async subscribe(socketId: string): Promise<void> {
    this.log(`[LatteStream PrivateChannel] Subscribing to ${this.name}, already subscribed: ${this.subscribed}`);

    if (this.subscribed) return;

    try {
      this.log(`[LatteStream PrivateChannel] Calling authorize for ${this.name}`);
      const authData = await this.authorize(this.name, socketId);
      this.log(`[LatteStream PrivateChannel] Got auth data:`, authData);

      const sent = this.send({
        event: 'lattestream:subscribe',
        data: {
          channel: this.name,
          auth: authData,
        },
      });

      if (sent) {
        this.log(`[LatteStream PrivateChannel] Sent subscription for ${this.name}`);
        // Don't set subscribed = true here - wait for subscription_succeeded event
      } else {
        this.log(`[LatteStream PrivateChannel] Failed to send subscription for ${this.name} - connection not ready`);
      }
    } catch (error) {
      this.log(`[LatteStream PrivateChannel] Authorization failed for ${this.name}:`, error);
      this.handleSubscriptionError(error);
    }
  }
}

export class PresenceChannel extends PrivateChannel {
  private members = new Map<string, PresenceMember>();
  private myId: string | null = null;
  private static memberPool = new ObjectPool<PresenceMember>(
    () => ({ id: '', info: undefined }),
    (member) => {
      member.id = '';
      member.info = undefined;
    }
  );

  getType(): ChannelType {
    return 'presence';
  }

  async subscribe(socketId: string, userData?: PresenceChannelData): Promise<void> {
    if (this.subscribed) return;

    try {
      const authData = await this.authorize(this.name, socketId);

      this.send({
        event: 'lattestream:subscribe',
        data: {
          channel: this.name,
          auth: authData,
          channel_data: userData ? JSON.stringify(userData) : undefined,
        },
      });
    } catch (error) {
      this.handleSubscriptionError(error);
    }
  }

  handleSubscriptionSucceeded(data?: any): void {
    const parsedData = this.parseEventData(data);

    if (parsedData && parsedData.presence) {
      this.members.clear();
      Object.entries(parsedData.presence.hash).forEach(([id, info]) => {
        this.members.set(id, { id, info: info as any });
      });

      if (parsedData.presence.me) {
        this.myId = parsedData.presence.me.id;
      }
    }

    super.handleSubscriptionSucceeded(parsedData);
  }

  handleMemberAdded(member: PresenceMember): void {
    const pooledMember = PresenceChannel.memberPool.acquire();
    pooledMember.id = member.id;
    pooledMember.info = member.info;

    this.members.set(member.id, pooledMember);
    this.handleEvent('lattestream:member_added', pooledMember);
  }

  handleMemberRemoved(member: PresenceMember): void {
    const existingMember = this.members.get(member.id);
    if (existingMember) {
      this.members.delete(member.id);
      this.handleEvent('lattestream:member_removed', existingMember);
      PresenceChannel.memberPool.release(existingMember);
    }
  }

  getMembers(): PresenceMember[] {
    return Array.from(this.members.values());
  }

  getMember(id: string): PresenceMember | undefined {
    return this.members.get(id);
  }

  getMyId(): string | null {
    return this.myId;
  }

  getMemberCount(): number {
    return this.members.size;
  }
}
