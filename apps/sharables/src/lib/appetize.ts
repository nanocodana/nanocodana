export type AppetizePlatform = 'android' | 'ios';

type AppetizeEmbedConfig = {
  publicKey: string;
  device: string;
};

type AppetizeSdkVersion = '50.0.0' | '51.0.0' | '52.0.0' | '53.0.0' | '54.0.0' | '55.0.0';

/**
 * Derived from Expo Snack website/src/client/configs/constants.tsx (MIT License).
 * We only need the embedded Appetize keys for standalone preview tabs.
 */
const APPETIZE_EMBED_CONFIG: Record<
  AppetizeSdkVersion,
  Record<AppetizePlatform, AppetizeEmbedConfig>
> = {
  '55.0.0': {
    android: { publicKey: 'b_2kbba42dzbt24ocqb6wismikvq', device: 'pixel8' },
    ios: { publicKey: 'b_7rz6fiv2dm33kjhaab6enspwpq', device: 'iphone16pro' },
  },
  '54.0.0': {
    android: { publicKey: 'b_f2dwltn2itrgkytn774d6xytsi', device: 'pixel8' },
    ios: { publicKey: 'b_z7jpltbm47xjfqycvoo2gs43ay', device: 'iphone16pro' },
  },
  '53.0.0': {
    android: { publicKey: 'b_izv57gk6we75b3xmb3ghavye2a', device: 'pixel7' },
    ios: { publicKey: 'b_ypet6quf7ns7lnnz7d56uhmima', device: 'iphone16pro' },
  },
  '52.0.0': {
    android: { publicKey: 'b_nx73hicerliek7kengc5hcw64m', device: 'pixel4' },
    ios: { publicKey: 'b_wydrpvnmdtlnfiflokxhfxu6bu', device: 'iphone12' },
  },
  '51.0.0': {
    android: { publicKey: 'kw54dyib72daha4mbwmpt6v76e', device: 'pixel4' },
    ios: { publicKey: '7g5tkw7ipmiyowgisnhlqqbtru', device: 'iphone12' },
  },
  '50.0.0': {
    android: { publicKey: 'hgzdls2srwti2a6s4saomqojwa', device: 'pixel4' },
    ios: { publicKey: '6bdvj26c3efkcdaoghibydqq6i', device: 'iphone12' },
  },
};

export const APPETIZE_IFRAME_ALLOW = [
  'accelerometer',
  'ambient-light-sensor',
  'autoplay',
  'battery',
  'camera',
  'fullscreen',
  'gamepad',
  'geolocation',
  'gyroscope',
  'idle-detection',
  'magnetometer',
  'microphone',
  'midi',
  'payment',
  'picture-in-picture',
  'screen-wake-lock',
  'usb',
].join('; ');

export function getAppetizeEmbedConfig(sdkVersion: string | undefined, platform: AppetizePlatform) {
  if (!sdkVersion || !(sdkVersion in APPETIZE_EMBED_CONFIG)) {
    return null;
  }

  return APPETIZE_EMBED_CONFIG[sdkVersion as AppetizeSdkVersion][platform];
}

export function buildAppetizeUrl(
  runtimeUrl: string | null,
  sdkVersion: string | undefined,
  platform: AppetizePlatform
) {
  if (!runtimeUrl) {
    return null;
  }

  const config = getAppetizeEmbedConfig(sdkVersion, platform);
  if (!config) {
    return null;
  }

  const url = new URL(`https://appetize.io/embed/${config.publicKey}`);
  url.searchParams.set('device', config.device);
  url.searchParams.set('launchUrl', runtimeUrl);
  url.searchParams.set(
    'params',
    JSON.stringify({
      EXDevMenuDisableAutoLaunch: true,
      EXKernelDisableNuxDefaultsKey: true,
    })
  );
  url.searchParams.set('appearance', 'light');
  url.searchParams.set('deviceColor', 'black');
  url.searchParams.set('scale', 'auto');
  url.searchParams.set('orientation', 'portrait');
  url.searchParams.set('centered', 'both');

  return url.toString();
}
