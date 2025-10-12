import { AuthOptions, ChannelAuthResponse, LatteStreamOptions } from './types';

export class Authorizer {
  constructor(
    private authEndpoint: string,
    private defaultAuthOptions: AuthOptions = {},
    private options: LatteStreamOptions = {}
  ) {}

  async authorize(channelName: string, socketId: string, authOptions?: AuthOptions): Promise<ChannelAuthResponse> {
    const options = { ...this.defaultAuthOptions, ...authOptions };

    const requestData: any = {
      socket_id: socketId,
      channel_name: channelName,
    };

    if (options.params) {
      Object.assign(requestData, options.params);
    }

    try {
      this.log(`[LatteStream Auth] Making request to ${this.authEndpoint}`, requestData);

      const response = await fetch(this.authEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        body: JSON.stringify(requestData),
      });

      this.log(`[LatteStream Auth] Response: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        throw new Error(`Authorization failed: ${response.status} ${response.statusText}`);
      }

      const authResponse: ChannelAuthResponse = await response.json();

      if (!authResponse.auth) {
        throw new Error('Invalid authorization response: missing auth field');
      }

      return {
        auth: authResponse.auth,
        channel_data: authResponse.channel_data,
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Channel authorization failed: ${error.message}`);
      }
      throw new Error('Channel authorization failed: Unknown error');
    }
  }

  async authorizePresence(
    channelName: string,
    socketId: string,
    userData: any,
    authOptions?: AuthOptions
  ): Promise<{ auth: string; channelData?: string }> {
    const options = { ...this.defaultAuthOptions, ...authOptions };

    const requestData: any = {
      socket_id: socketId,
      channel_name: channelName,
      channel_data: JSON.stringify(userData),
    };

    if (options.params) {
      Object.assign(requestData, options.params);
    }

    try {
      const response = await fetch(this.authEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        body: JSON.stringify(requestData),
      });

      if (!response.ok) {
        throw new Error(`Authorization failed: ${response.status} ${response.statusText}`);
      }

      const authResponse: ChannelAuthResponse = await response.json();

      if (!authResponse.auth) {
        throw new Error('Invalid authorization response: missing auth field');
      }

      return {
        auth: authResponse.auth,
        channelData: authResponse.channel_data,
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Presence channel authorization failed: ${error.message}`);
      }
      throw new Error('Presence channel authorization failed: Unknown error');
    }
  }

  private log(...args: any[]): void {
    if (this.options.enableLogging) {
      console.log('[LatteStream]', ...args);
    }
  }
}

export function getChannelType(channelName: string): 'public' | 'private' | 'presence' {
  if (channelName.startsWith('presence-')) {
    return 'presence';
  } else if (channelName.startsWith('private-')) {
    return 'private';
  }
  return 'public';
}
