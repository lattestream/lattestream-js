import { LatteStreamOptions } from './types';

export async function createLatteStreamClient(appKey: string, options: any) {
  const { LatteStream } = await import('./client');
  return new LatteStream(appKey, options);
}

export async function createAuthorizer(authEndpoint: string, authOptions?: any, options?: LatteStreamOptions) {
  const { Authorizer } = await import('./auth');
  return new Authorizer(authEndpoint, authOptions, options);
}

export async function getChannelType(channelName: string) {
  const { getChannelType } = await import('./auth');
  return getChannelType(channelName);
}

export async function createPerformanceMonitor() {
  const { PerformanceMonitor } = await import('./performance');
  return new PerformanceMonitor();
}

export const LazyLatteStream = {
  createClient: createLatteStreamClient,
  createAuthorizer,
  getChannelType,
  createPerformanceMonitor,
};
