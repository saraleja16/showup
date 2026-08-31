import { createTennisLikeConfig, PICKLEBALL_SESSION_TYPES } from './tennis';
import { PickleballCourt } from './silhouettes/PickleballCourt';

export const pickleballConfig = createTennisLikeConfig({
  id: 'pickleball',
  label: 'Pickleball',
  icon: 'disc-outline',
  emoji: '🏓',
  silhouette: PickleballCourt,
  sessionTypes: PICKLEBALL_SESSION_TYPES,
});
