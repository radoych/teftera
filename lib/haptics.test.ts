import * as Haptics from 'expo-haptics';
import { haptics } from './haptics';

// expo-haptics is mocked module-wide in jest.setup.ts.
const mocked = Haptics as jest.Mocked<typeof Haptics>;

describe('haptics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mocked.impactAsync.mockResolvedValue(undefined);
    mocked.selectionAsync.mockResolvedValue(undefined);
    mocked.notificationAsync.mockResolvedValue(undefined);
  });

  it('maps each cue to the matching expo-haptics call', () => {
    haptics.tap();
    haptics.select();
    haptics.success();
    haptics.error();
    expect(mocked.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
    expect(mocked.selectionAsync).toHaveBeenCalledTimes(1);
    expect(mocked.notificationAsync).toHaveBeenCalledWith(
      Haptics.NotificationFeedbackType.Success,
    );
    expect(mocked.notificationAsync).toHaveBeenCalledWith(
      Haptics.NotificationFeedbackType.Error,
    );
  });

  it('swallows rejections from unsupported devices', async () => {
    mocked.impactAsync.mockRejectedValue(new Error('unsupported'));
    expect(() => haptics.tap()).not.toThrow();
    await Promise.resolve();
  });
});
