import { EncryptionHelper } from './encryption';
import { AuthenticationResult } from './types';

export class ServerAuthorizer {
  private encryptionHelper: EncryptionHelper;

  constructor(private appKey: string, private masterKey: string) {
    this.encryptionHelper = new EncryptionHelper(masterKey);
  }

  authorizeChannel(socketId: string, channelName: string): AuthenticationResult {
    if (!this.isValidChannelName(channelName)) {
      throw new Error(`Invalid channel name: ${channelName}`);
    }

    if (!this.isValidSocketId(socketId)) {
      throw new Error(`Invalid socket ID: ${socketId}`);
    }

    const auth = this.encryptionHelper.generateAuthString(socketId, channelName);
    
    return { auth };
  }

  authorizePresenceChannel(
    socketId: string, 
    channelName: string, 
    userData: any
  ): AuthenticationResult {
    if (!channelName.startsWith('presence-')) {
      throw new Error(`Channel ${channelName} is not a presence channel`);
    }

    if (!this.isValidSocketId(socketId)) {
      throw new Error(`Invalid socket ID: ${socketId}`);
    }

    if (!userData || typeof userData !== 'object') {
      throw new Error('User data is required for presence channels');
    }

    if (!userData.user_id) {
      throw new Error('user_id is required in userData for presence channels');
    }

    const channelData = JSON.stringify(userData);
    const auth = this.encryptionHelper.generateAuthString(socketId, channelName, channelData);
    
    return { 
      auth,
      channelData 
    };
  }

  verifyChannelAuth(authString: string, channelName: string, channelData?: string): boolean {
    return this.encryptionHelper.verifyAuthString(authString, channelName, channelData);
  }

  authenticateUser(socketId: string, userData?: any): string {
    if (!this.isValidSocketId(socketId)) {
      throw new Error(`Invalid socket ID: ${socketId}`);
    }

    const userAuthData = {
      socket_id: socketId,
      user_data: userData,
      timestamp: Date.now()
    };

    return this.encryptionHelper.generateAuthString(socketId, 'user-auth', JSON.stringify(userAuthData));
  }

  generateWebhookSignature(payload: string): string {
    return this.encryptionHelper.generateWebhookSignature(payload);
  }

  verifyWebhookSignature(payload: string, signature: string): boolean {
    return this.encryptionHelper.verifyWebhookSignature(payload, signature);
  }

  private isValidChannelName(channelName: string): boolean {
    if (!channelName || typeof channelName !== 'string') {
      return false;
    }

    if (channelName.length > 200) {
      return false;
    }

    const validChannelPattern = /^[a-zA-Z0-9_\-=@,.;]+$/;
    return validChannelPattern.test(channelName);
  }

  private isValidSocketId(socketId: string): boolean {
    if (!socketId || typeof socketId !== 'string') {
      return false;
    }

    const socketIdPattern = /^[0-9a-f]+\.[0-9a-f]+$/;
    return socketIdPattern.test(socketId);
  }
}

export function createChannelAuthMiddleware(
  appKey: string,
  masterKey: string,
  getUserData?: (req: any) => any
) {
  const authorizer = new ServerAuthorizer(appKey, masterKey);

  return (req: any, res: any, next?: () => void) => {
    try {
      const { socket_id, channel_name, channel_data } = req.body;

      if (!socket_id || !channel_name) {
        return res.status(400).json({
          error: 'socket_id and channel_name are required'
        });
      }

      let result: AuthenticationResult;

      if (channel_name.startsWith('presence-')) {
        const userData = getUserData ? getUserData(req) : JSON.parse(channel_data || '{}');
        result = authorizer.authorizePresenceChannel(socket_id, channel_name, userData);
      } else if (channel_name.startsWith('private-')) {
        result = authorizer.authorizeChannel(socket_id, channel_name);
      } else {
        return res.status(400).json({
          error: 'Only private and presence channels require authorization'
        });
      }

      res.json(result);
      
      if (next) next();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Authorization failed';
      res.status(403).json({ error: message });
    }
  };
}