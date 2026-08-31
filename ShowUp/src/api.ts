import { create } from 'axios';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

if (!API_BASE_URL) {
  throw new Error('EXPO_PUBLIC_API_BASE_URL is not set. Check ShowUp/.env');
}

export type User = {
  id: string;
  firstName: string;
  lastName: string;
  displayName: string;
  username: string;
  email: string;
  avatarUrl: string | null;
  dateOfBirth: string;
  sex: string;
  preferredSports: string[];
  skillLevel?: string | null;
  /** False until the emailed OTP is redeemed. Google sign-ins are verified automatically. */
  isEmailVerified?: boolean;
  createdAt: string;
  /** JWT from login/register — required for matchmaking & location endpoints */
  accessToken?: string | null;
};

export type RegisterPayload = {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  password: string;
  dateOfBirth: string;
  sex: string;
  preferredSports: string[];
};

export type LoginPayload = {
  email: string;
  password: string;
};

export type GoogleLoginPayload = {
  idToken: string;
};

export type Venue = {
  id: number;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  /** Backend may return a single string (e.g. "Tennis") or a list. */
  sports: string | string[];
};

export type EventSportDetails = {
  format?: string;
  sessionType?: string;
  skillLevel?: string;
  durationMinutes?: number;
  bringingBall?: boolean;
  maxPlayers?: number;
  notes?: string;
};

export type InitialClaim = {
  slotId: string;
  /** Set when the organizer reserves the slot for a friend by name */
  friendName?: string;
  /** Set when the organizer reserves the slot for themselves */
  friendUserId?: string;
};

export type CreateEventPayload = {
  creatorId: string;
  sport: string;
  venueId: number;
  title: string;
  scheduledAt: string;
  sportDetails: Record<string, unknown>;
  /** Optional pre-filled slot claims for Soccer events */
  initialClaims?: InitialClaim[];
  /** When true, only the host's matched connections can see/join this event. Defaults to false. */
  isPrivate?: boolean;
};

export type EventItem = {
  id: string;
  title: string;
  sport?: string;
  sportDetails?: EventSportDetails | null;
  venueId?: number;
  venueName?: string;
  /** Legacy description field — may be absent on new tennis events */
  description?: string;
  creatorId: string;
  latitude: number;
  longitude: number;
  scheduledAt: string;
  maxPlayers: number;
  participantCount: number;
  createdAt: string;
  /** Populated when getEvents is called with a userId. Null when user is not a participant. */
  myStatus?: 'Registered' | 'Attended' | 'NoShow' | 'CancelledEarly' | 'CancelledLate' | null;
  /** True when this event uses position-based joining (has formation slots). */
  hasPositions?: boolean;
  /** Number of claimed slots; only meaningful when hasPositions is true. */
  claimedCount?: number | null;
  /** Total pending join requests. Only present when userId is the event's creator. */
  pendingRequestCount?: number;
  /** Present when the caller has a pending join request on this event. */
  myRequestStatus?: 'pending';
  /** True when only the host's matched connections can see/join this event. */
  isPrivate?: boolean;
  /** UTC scheduled end when duration is known. */
  scheduledEnd?: string | null;
  /** Upcoming | StartingSoon | Live | Finished | ResultPending | Completed */
  liveStatus?: string | null;
  presentCount?: number | null;
  pendingAttendanceCount?: number | null;
  absentCount?: number | null;
  resultSummary?: EventResultSummary | null;
};

export type LiveParticipant = {
  userId: string;
  displayName: string;
  avatarUrl?: string | null;
  attendanceStatus: string;
  verificationMethod?: string | null;
};

export type EventResultSummary = {
  resultId: string;
  status: string;
  sport: string;
  summary: string;
  scoreA?: number | null;
  scoreB?: number | null;
  unitsWonA?: number | null;
  unitsWonB?: number | null;
  sets?: { sideA: number; sideB: number }[] | null;
  games?: { sideA: number; sideB: number }[] | null;
  sideALabel?: string | null;
  sideBLabel?: string | null;
  submittedByUserId: string;
  submittedAt: string;
  confirmedByUserId?: string | null;
  confirmedAt?: string | null;
  disputedByUserId?: string | null;
};

export type LiveEventResponse = {
  eventId: string;
  sport: string;
  scheduledStart: string;
  scheduledEnd: string;
  serverNow: string;
  status: string;
  elapsedSeconds: number;
  remainingSeconds?: number | null;
  participantCount: number;
  presentCount: number;
  pendingCount: number;
  absentCount: number;
  participants: LiveParticipant[];
  resultSummary?: EventResultSummary | null;
  permissions?: {
    canSubmitResult?: boolean;
    canConfirmResult?: boolean;
    canDisputeResult?: boolean;
    canManageAttendance?: boolean;
  } | null;
};

export type ConfirmAttendancePayload = {
  hostUserId: string;
  noShowUserIds: string[];
};

export type SubmitEventResultPayload = {
  submittedByUserId: string;
  sideALabel?: string;
  sideBLabel?: string;
  scoreA?: number;
  scoreB?: number;
  /** Tennis / Volleyball (and pickleball if not using games). */
  sets?: { sideA: number; sideB: number }[];
  /** Pickleball preferred field (backend also accepts sets). */
  games?: { sideA: number; sideB: number }[];
};

export type JoinEventPayload = {
  userId: string;
};

export type JoinEventResponse = {
  eventId: string;
  userId: string;
  status: string;
  joinedAt: string;
};

export type UsernameCheckResponse = {
  username: string;
  available: boolean;
};

const apiClient = create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

let authToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setApiAccessToken(token: string | null) {
  authToken = token && token.trim() ? token.trim() : null;
  if (authToken) {
    apiClient.defaults.headers.common.Authorization = `Bearer ${authToken}`;
  } else {
    delete apiClient.defaults.headers.common.Authorization;
  }
}

export function setApiUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

apiClient.interceptors.request.use((config) => {
  if (authToken) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${authToken}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (isApiError(error) && error.response?.status === 401) {
      onUnauthorized?.();
    }
    return Promise.reject(error);
  }
);

type ApiErrorBody = {
  message?: string;
};

type ApiErrorHeaders = {
  get?: (name: string) => string | null | undefined;
  [key: string]: unknown;
};

type ApiError = {
  response?: {
    status?: number;
    data?: ApiErrorBody | string;
    headers?: ApiErrorHeaders;
  };
  code?: string;
  message?: string;
};

export function isApiError(error: unknown): error is ApiError {
  return typeof error === 'object' && error !== null && 'response' in error;
}

function readResponseHeader(headers: ApiErrorHeaders | undefined, name: string): string | undefined {
  if (!headers) return undefined;
  if (typeof headers.get === 'function') {
    const viaGetter = headers.get(name) ?? headers.get(name.toLowerCase());
    if (typeof viaGetter === 'string' && viaGetter.trim()) return viaGetter.trim();
  }
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
  if (!key) return undefined;
  const value = headers[key];
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (Array.isArray(value) && typeof value[0] === 'string' && value[0].trim()) return value[0].trim();
  return undefined;
}

/** Seconds from Retry-After when it is an integer delay. HTTP-date values are ignored. */
export function getRetryAfterSeconds(error: unknown): number | undefined {
  if (!isApiError(error) || error.response?.status !== 429) return undefined;
  const raw = readResponseHeader(error.response.headers, 'Retry-After');
  if (!raw) return undefined;
  const asInt = Number.parseInt(raw, 10);
  if (Number.isFinite(asInt) && String(asInt) === raw.trim() && asInt > 0) {
    return asInt;
  }
  return undefined;
}

function extractCleanApiMessage(data: ApiErrorBody | string | undefined): string | undefined {
  if (typeof data === 'string') {
    const trimmed = data.trim();
    if (!trimmed) return undefined;
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed) as ApiErrorBody;
        if (typeof parsed?.message === 'string' && parsed.message.trim()) {
          return parsed.message.trim();
        }
      } catch {
        return undefined;
      }
      return undefined;
    }
    // Avoid dumping stack traces / internals into the UI.
    if (trimmed.includes('\n') || /at\s+\S+\s+\(/i.test(trimmed)) return undefined;
    return trimmed;
  }
  if (data && typeof data === 'object' && typeof data.message === 'string' && data.message.trim()) {
    return data.message.trim();
  }
  return undefined;
}

export function getApiErrorStatus(error: unknown): number | undefined {
  return isApiError(error) ? error.response?.status : undefined;
}

export function isNetworkError(error: unknown): boolean {
  if (!isApiError(error)) return false;
  if (error.response) return false;
  const code = error.code;
  const message = typeof error.message === 'string' ? error.message.toLowerCase() : '';
  return (
    code === 'ERR_NETWORK' ||
    code === 'ECONNABORTED' ||
    message.includes('network') ||
    message.includes('timeout')
  );
}

export type ApiErrorMessageOptions = {
  /** Used for HTTP 429 when Retry-After is absent and body has no clean message. */
  rateLimitedFallback?: string;
};

export function getApiErrorMessage(
  error: unknown,
  fallback = 'Something went wrong. Please try again.',
  options?: ApiErrorMessageOptions
): string {
  if (isNetworkError(error) || (isApiError(error) && !error.response)) {
    return 'Unable to connect. Check your connection and try again.';
  }

  if (!isApiError(error) || !error.response) {
    return fallback;
  }

  if (error.response.status === 429) {
    const retryAfterSeconds = getRetryAfterSeconds(error);
    if (retryAfterSeconds != null) {
      return `Too many attempts. Try again in ${retryAfterSeconds} seconds.`;
    }
    const bodyMessage = extractCleanApiMessage(error.response.data);
    if (bodyMessage) return bodyMessage;
    return options?.rateLimitedFallback ?? 'Too many attempts. Please try again shortly.';
  }

  if (error.response.status === 401) {
    return 'Invalid email or password.';
  }

  const bodyMessage = extractCleanApiMessage(error.response.data);
  if (bodyMessage) return bodyMessage;

  return fallback;
}

/** Prefer this for result submit/confirm/dispute so HTTP status is never hidden. */
export function getResultApiErrorMessage(
  error: unknown,
  fallback = 'Could not submit result.'
): string {
  if (isNetworkError(error) || (isApiError(error) && !error.response)) {
    return 'Unable to connect. Check your connection and try again.';
  }
  if (!isApiError(error) || !error.response) {
    return fallback;
  }
  const status = error.response.status;
  const bodyMessage = extractCleanApiMessage(error.response.data);
  if (bodyMessage) return `HTTP ${status}: ${bodyMessage}`;
  if (status) return `HTTP ${status}: ${fallback}`;
  return fallback;
}

export async function getUserById(id: string): Promise<User> {
  const { data } = await apiClient.get<User>(`/users/${id}`);
  return data;
}

export async function checkUsername(username: string): Promise<UsernameCheckResponse> {
  const { data } = await apiClient.get<UsernameCheckResponse>(
    `/users/check-username/${encodeURIComponent(username)}`
  );
  return data;
}

export async function registerUser(payload: RegisterPayload): Promise<User> {
  const { data } = await apiClient.post<User>('/auth/register', payload);
  return data;
}

export async function loginUser(payload: LoginPayload): Promise<User> {
  const { data } = await apiClient.post<User>('/auth/login', payload);
  return data;
}

export type SendVerificationCodeResponse = {
  sent: boolean;
  retryAfterSeconds: number;
  message: string;
};

/** Requests a fresh 6-digit code by email. Always resolves for a valid address. */
export async function sendVerificationCode(email: string): Promise<SendVerificationCodeResponse> {
  const { data } = await apiClient.post<SendVerificationCodeResponse>('/auth/send-verification-code', {
    email,
  });
  return data;
}

/** Redeems a code and returns the refreshed user (with a new access token). */
export async function verifyEmail(email: string, code: string): Promise<User> {
  const { data } = await apiClient.post<User>('/auth/verify-email', { email, code });
  return data;
}

export async function googleLogin(payload: GoogleLoginPayload): Promise<User> {
  const { data } = await apiClient.post<User>('/auth/google', payload);
  return data;
}

export async function getVenues(sport: string): Promise<Venue[]> {
  const { data } = await apiClient.get<Venue[]>(`/venues?sport=${encodeURIComponent(sport)}`);
  return (data ?? []).map((v) => ({
    ...v,
    latitude: Number(v.latitude),
    longitude: Number(v.longitude),
  }));
}

export async function getEvents(userId?: string): Promise<EventItem[]> {
  const url = userId ? `/events?userId=${encodeURIComponent(userId)}` : '/events';
  const { data } = await apiClient.get<EventItem[]>(url);
  return (data ?? []).map((e) => ({
    ...e,
    latitude: Number(e.latitude),
    longitude: Number(e.longitude),
  }));
}

export type InterpretedEventFilters = {
  intentType?: string | null;
  sport?: string | null;
  radiusKm?: number | null;
  date?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  skillLevel?: string | null;
  locationQuery?: string | null;
  resolvedLocation?: {
    name: string;
    latitude: number;
    longitude: number;
  } | null;
};

export type AiSearchVenue = {
  id: number | string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  sports: string;
};

export type AiSearchEventsResponse = {
  interpretedFilters: InterpretedEventFilters;
  events: EventItem[];
  venues?: AiSearchVenue[];
};

/** Natural-language event search via ShowUpBackend only (AI key stays server-side). */
export async function aiSearchEvents(query: string): Promise<AiSearchEventsResponse> {
  const { data } = await apiClient.post<AiSearchEventsResponse>(
    '/ai/search-events',
    { query },
    { timeout: 20000 }
  );

  return {
    interpretedFilters: data?.interpretedFilters ?? {},
    events: (data?.events ?? []).map((e) => ({
      ...e,
      latitude: Number(e.latitude),
      longitude: Number(e.longitude),
    })),
    venues: (data?.venues ?? []).map((v) => ({
      ...v,
      latitude: Number(v.latitude),
      longitude: Number(v.longitude),
      sports: typeof v.sports === 'string' ? v.sports : String(v.sports ?? ''),
    })),
  };
}

export async function getEventById(id: string, userId?: string): Promise<EventItem> {
  const url = userId
    ? `/events/${encodeURIComponent(id)}?userId=${encodeURIComponent(userId)}`
    : `/events/${encodeURIComponent(id)}`;
  const { data } = await apiClient.get<EventItem>(url);
  return data;
}

export async function createEvent(payload: CreateEventPayload): Promise<EventItem> {
  const { data } = await apiClient.post<EventItem>('/events', payload);
  return data;
}

export async function joinEvent(eventId: string, payload: JoinEventPayload): Promise<JoinEventResponse> {
  const { data } = await apiClient.post<JoinEventResponse>(`/events/${eventId}/join`, payload);
  return data;
}

export type NotificationItem = {
  id: string;
  userId: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
};

export type UnreadCountResponse = {
  count: number;
};

export async function getUnreadNotificationCount(userId: string): Promise<number> {
  const { data } = await apiClient.get<UnreadCountResponse>(
    `/notifications/unread-count/${encodeURIComponent(userId)}`
  );
  return data.count;
}

export async function getUserNotifications(userId: string): Promise<NotificationItem[]> {
  const { data } = await apiClient.get<NotificationItem[]>(
    `/notifications/user/${encodeURIComponent(userId)}`
  );
  return data;
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  await apiClient.post(`/notifications/${encodeURIComponent(notificationId)}/read`);
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  await apiClient.post(`/notifications/mark-all-read/${encodeURIComponent(userId)}`);
}

export type SavePushTokenPayload = {
  userId: string;
  token: string;
  platform: string;
};

export async function savePushToken(payload: SavePushTokenPayload): Promise<void> {
  await apiClient.post('/notifications/save-token', payload);
}

// ─── Profile ──────────────────────────────────────────────────────────────────

export type ProfileUser = {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  avatarUrl: string | null;
};

export type ProfileStats = {
  gamesPlayed: number;
  gamesHosted: number;
  upcomingCount: number;
};

export type ProfileReliability = {
  score: number;
  tier: 'excellent' | 'good' | 'at_risk' | 'unreliable';
  sampleSize: number;
};

export type UpcomingGame = {
  eventId: string;
  sport: string;
  title: string;
  venueName: string | null;
  scheduledAt: string;
  currentPlayers: number;
  maxPlayers: number;
  isHost: boolean;
};

export type ProfileResponse = {
  user: ProfileUser;
  stats: ProfileStats;
  reliability: ProfileReliability;
  sports: string[];
  upcomingGames: UpcomingGame[];
};

/** Portfolio event lifecycle from GET /profile/{id}/portfolio */
export type PortfolioEventStatus =
  | 'Upcoming'
  | 'StartingSoon'
  | 'Live'
  | 'Finished'
  | 'ResultPending'
  | 'Completed'
  | string;

export type PortfolioUserOutcome = 'Win' | 'Loss' | 'Draw' | 'Pending' | string | null;

export type PortfolioParticipant = {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  attendanceStatus: string;
  verificationMethod?: string | null;
  verificationLabel?: string | null;
  side?: string | null;
  isHost: boolean;
};

export type PortfolioSide = {
  side: string;
  label: string | null;
  participants: PortfolioParticipant[];
};

export type PortfolioResult = {
  resultId: string;
  status: string;
  sport: string;
  summary: string;
  winnerSide: string | null;
  scoreA: number | null;
  scoreB: number | null;
  sideAWins: number | null;
  sideBWins: number | null;
  sets?: { sideA: number; sideB: number }[] | null;
  games?: { sideA: number; sideB: number }[] | null;
  sideALabel: string | null;
  sideBLabel: string | null;
};

export type PortfolioGame = {
  eventId: string;
  title: string;
  sport: string;
  venueName: string | null;
  scheduledStart: string;
  scheduledEnd: string;
  eventStatus: PortfolioEventStatus;
  isHost: boolean;
  participantCount: number;
  presentCount: number;
  pendingCount: number;
  absentCount: number;
  participants: PortfolioParticipant[];
  sideA: PortfolioSide | null;
  sideB: PortfolioSide | null;
  userSide: string | null;
  result: PortfolioResult | null;
  userOutcome: PortfolioUserOutcome;
  attendanceVerificationLabel: string | null;
};

export type ProfilePortfolioResponse = {
  stats: ProfileStats;
  played: PortfolioGame[];
  hosted: PortfolioGame[];
  upcomingGames: PortfolioGame[];
};

export type PortfolioGamesPageResponse = {
  type: 'played' | 'hosted' | 'upcoming' | string;
  total: number;
  page: number;
  pageSize: number;
  items: PortfolioGame[];
};

export type PortfolioGamesType = 'played' | 'hosted' | 'upcoming';

export type UpdateProfilePayload = {
  firstName: string;
  lastName: string;
  username: string;
};

export type AvatarUploadFile = {
  uri: string;
  name: string;
  type: string;
};

export async function getProfile(userId: string): Promise<ProfileResponse> {
  const { data } = await apiClient.get<ProfileResponse>(`/profile/${encodeURIComponent(userId)}`);
  return data;
}

export async function getProfilePortfolio(userId: string): Promise<ProfilePortfolioResponse> {
  const { data } = await apiClient.get<ProfilePortfolioResponse>(
    `/profile/${encodeURIComponent(userId)}/portfolio`
  );
  return data;
}

export async function getProfileGames(
  userId: string,
  type: PortfolioGamesType,
  page = 1,
  pageSize = 50
): Promise<PortfolioGamesPageResponse> {
  const { data } = await apiClient.get<PortfolioGamesPageResponse>(
    `/profile/${encodeURIComponent(userId)}/games`,
    { params: { type, page, pageSize } }
  );
  return data;
}

export async function updateProfile(
  userId: string,
  payload: UpdateProfilePayload
): Promise<ProfileResponse> {
  const { data } = await apiClient.put<ProfileResponse>(
    `/profile/${encodeURIComponent(userId)}`,
    payload
  );
  return data;
}

export async function uploadProfileAvatar(
  userId: string,
  file: AvatarUploadFile
): Promise<{ avatarUrl: string }> {
  const endpoint = `/profile/${encodeURIComponent(userId)}/avatar`;
  const formData = new FormData();

  if (file.uri.startsWith('blob:')) {
    const blob = await fetch(file.uri).then((response) => response.blob());
    formData.append('file', blob, file.name);
  } else {
    formData.append('file', {
      uri: file.uri,
      name: file.name,
      type: file.type,
    } as unknown as Blob);
  }

  try {
    const { data } = await apiClient.post<{ avatarUrl: string }>(endpoint, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data;
  } catch (err) {
    if (__DEV__) {
      console.log('[ProfileAvatar] uploadProfileAvatar error', err);
    }
    throw err;
  }
}

export async function removeProfileAvatar(userId: string): Promise<void> {
  await apiClient.delete(`/profile/${encodeURIComponent(userId)}/avatar`);
}

export async function updateSports(userId: string, sports: string[]): Promise<{ sports: string[] }> {
  const { data } = await apiClient.put<{ sports: string[] }>(
    `/profile/${encodeURIComponent(userId)}/sports`,
    { sports }
  );
  return data;
}

// ─── Formations ───────────────────────────────────────────────────────────────

export type FormationSlot = {
  slotId: string;
  team: string;
  role: string;
  /** 0–100: 0 = left edge, 100 = right edge */
  x: number;
  /** 0–100: 0 = top team's goal line, 100 = bottom team's goal line */
  y: number;
};

/**
 * Fetches the slot template for any sport.
 * Route: GET /api/sports/{sportId}/formations?format={format}
 */
export async function getFormations(sport: string, format: string): Promise<FormationSlot[]> {
  const { data } = await apiClient.get<FormationSlot[]>(
    `/sports/${encodeURIComponent(sport)}/formations?format=${encodeURIComponent(format)}`
  );
  return data;
}

// ─── Event positions ──────────────────────────────────────────────────────────

export type LiveSlot = {
  slotId: string;
  team: string;
  role: string;
  x: number;
  y: number;
  status: 'open' | 'claimed';
  claimedByUserId: string | null;
  claimedByDisplayName: string | null;
  claimedAt: string | null;
  /** Number of pending requests on this slot. Present only when callerId was supplied to getEventPositions. */
  pendingRequestCount?: number;
  /** True when the caller has a pending request on this slot. Present only when callerId was supplied. */
  isMyPendingRequest?: boolean;
  /** The caller's own pending requestId on this slot. Present only when isMyPendingRequest is true. */
  requestId?: string | null;
};

export function isHttpError(error: unknown, status: number): boolean {
  return isApiError(error) && error.response?.status === status;
}

// ─── Matchmaking ─────────────────────────────────────────────────────────────

export type MatchCandidate = {
  userId: string;
  displayName: string;
  profileImageUrl: string | null;
  reliabilityScore: number;
  skillLevel: string;
  sharedSports: string[];
  primarySharedSport: string;
  approximateDistanceKm: number;
  isConnectionPending?: boolean;
};

export type MatchCandidatesResponse = {
  items: MatchCandidate[];
  nextCursor: string | null;
  pageSize: number;
};

export type MatchActionResponse = {
  success: boolean;
  isMutualMatch: boolean;
  connectionId: string | null;
};

export type MatchCandidatesQuery = {
  latitude: number;
  longitude: number;
  radiusKm?: number;
  sportId?: string;
  pageSize?: number;
  cursor?: string | null;
};

export async function getMatchCandidates(
  query: MatchCandidatesQuery
): Promise<MatchCandidatesResponse> {
  const params: Record<string, string | number> = {
    latitude: query.latitude,
    longitude: query.longitude,
  };
  if (query.radiusKm != null) params.radiusKm = query.radiusKm;
  if (query.sportId) params.sportId = query.sportId;
  if (query.pageSize != null) params.pageSize = query.pageSize;
  if (query.cursor) params.cursor = query.cursor;

  const { data } = await apiClient.get<MatchCandidatesResponse>('/matches/candidates', {
    params,
  });
  return {
    items: data.items ?? [],
    nextCursor: data.nextCursor ?? null,
    pageSize: data.pageSize,
  };
}

export async function skipMatchCandidate(candidateUserId: string): Promise<MatchActionResponse> {
  const { data } = await apiClient.post<MatchActionResponse>(
    `/matches/${encodeURIComponent(candidateUserId)}/skip`
  );
  return data;
}

export async function connectMatchCandidate(candidateUserId: string): Promise<MatchActionResponse> {
  const { data } = await apiClient.post<MatchActionResponse>(
    `/matches/${encodeURIComponent(candidateUserId)}/connect`
  );
  return data;
}

// ─── Connection requests (Sent / Incoming / Rejected, backed by MatchDecisions) ──

export type MatchRequestUser = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  preferredSports: string[];
  skillLevel: string | null;
  reliabilityScore: number | null;
};

export type MatchRequestListItem = {
  requestId: string;
  user: MatchRequestUser;
  targetUser: MatchRequestUser;
  status: 'Pending' | 'Accepted' | 'Rejected' | 'Cancelled';
  createdAt: string;
  updatedAt: string;
};

export type MatchRequestCounts = {
  incomingCount: number;
  sentPendingCount: number;
  rejectedCount: number;
};

export type MatchRequestActionResult = {
  success: boolean;
  status: string;
  connectionId: string | null;
  requestId: string | null;
};

export async function getSentMatchRequests(): Promise<MatchRequestListItem[]> {
  const { data } = await apiClient.get<{ items: MatchRequestListItem[] }>('/matches/requests/sent');
  return data?.items ?? [];
}

export async function getIncomingMatchRequests(): Promise<MatchRequestListItem[]> {
  const { data } = await apiClient.get<{ items: MatchRequestListItem[] }>('/matches/requests/incoming');
  return data?.items ?? [];
}

export async function getRejectedMatchRequests(): Promise<MatchRequestListItem[]> {
  const { data } = await apiClient.get<{ items: MatchRequestListItem[] }>('/matches/requests/rejected');
  return data?.items ?? [];
}

export async function getMatchRequestCounts(): Promise<MatchRequestCounts> {
  const { data } = await apiClient.get<MatchRequestCounts>('/matches/requests/counts');
  return data;
}

export async function acceptMatchRequestById(requestId: string): Promise<MatchRequestActionResult> {
  const { data } = await apiClient.post<MatchRequestActionResult>(
    `/matches/requests/${encodeURIComponent(requestId)}/accept`
  );
  return data;
}

export async function declineMatchRequestById(requestId: string): Promise<MatchRequestActionResult> {
  const { data } = await apiClient.post<MatchRequestActionResult>(
    `/matches/requests/${encodeURIComponent(requestId)}/reject`
  );
  return data;
}

export async function cancelMatchRequestById(requestId: string): Promise<MatchRequestActionResult> {
  const { data } = await apiClient.delete<MatchRequestActionResult>(
    `/matches/requests/${encodeURIComponent(requestId)}`
  );
  return data;
}

export async function updateMyLocation(latitude: number, longitude: number): Promise<void> {
  await apiClient.put('/users/me/location', { latitude, longitude });
}

export async function updateMySkillLevel(skillLevel: string): Promise<{ skillLevel: string }> {
  const { data } = await apiClient.put<{ skillLevel: string }>('/users/me/skill-level', {
    skillLevel,
  });
  return data;
}

// ─── Discovery (search-driven match selection) ────────────────────────────────

export type UserSearchResult = {
  userId: string;
  displayName: string;
  username: string;
  profileImageUrl: string | null;
  skillLevel: string | null;
  isConnected: boolean;
  isConnectionPending?: boolean;
};

export async function searchUsersForMatch(query: string): Promise<UserSearchResult[]> {
  const { data } = await apiClient.get<{ items: UserSearchResult[] }>('/matches/discovery', {
    params: { q: query },
  });
  return data.items ?? [];
}

// ─── Chat (private messaging between matches) ─────────────────────────────────

export type Conversation = {
  connectionId: string;
  otherUserId: string;
  otherUserDisplayName: string;
  otherUserAvatarUrl: string | null;
  lastMessage: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
  connectedAt: string;
};

export type ChatMessage = {
  id: string;
  connectionId: string;
  senderId: string;
  content: string;
  createdAt: string;
  readAt: string | null;
};

export type MessagesPage = {
  items: ChatMessage[];
  nextCursor: string | null;
};

export async function getConversations(): Promise<Conversation[]> {
  const { data } = await apiClient.get<Conversation[]>('/chat/conversations');
  return data ?? [];
}

export async function getMessages(connectionId: string, cursor?: string | null): Promise<MessagesPage> {
  const params: Record<string, string> = {};
  if (cursor) params.cursor = cursor;
  const { data } = await apiClient.get<MessagesPage>(
    `/chat/conversations/${encodeURIComponent(connectionId)}/messages`,
    { params }
  );
  return { items: data.items ?? [], nextCursor: data.nextCursor ?? null };
}

export async function sendChatMessage(connectionId: string, content: string): Promise<ChatMessage> {
  const { data } = await apiClient.post<ChatMessage>(
    `/chat/conversations/${encodeURIComponent(connectionId)}/messages`,
    { content }
  );
  return data;
}

export async function markConversationRead(connectionId: string): Promise<void> {
  await apiClient.post(`/chat/conversations/${encodeURIComponent(connectionId)}/read`);
}

// ─── Connections (my matches list + unmatch) ──────────────────────────────────

export type Connection = {
  connectionId: string;
  userId: string;
  displayName: string;
  profileImageUrl: string | null;
  skillLevel: string | null;
  connectedAt: string;
};

export async function getMyConnections(): Promise<Connection[]> {
  const { data } = await apiClient.get<Connection[]>('/matches/connections');
  return data ?? [];
}

export async function unmatchConnection(connectionId: string): Promise<void> {
  await apiClient.delete(`/matches/connections/${encodeURIComponent(connectionId)}`);
}

// ─── Event invitations (invite a match, accept/decline) ──────────────────────

export type EventInvitation = {
  invitationId: string;
  eventId: string;
  eventTitle: string;
  sport: string;
  scheduledAt: string;
  venueName: string | null;
  slotId: string | null;
  slotRole: string | null;
  inviterId: string;
  inviterDisplayName: string;
  status: string;
  createdAt: string;
};

export async function inviteToEvent(
  eventId: string,
  inviteeId: string,
  slotId?: string
): Promise<EventInvitation> {
  const { data } = await apiClient.post<EventInvitation>(
    `/events/${encodeURIComponent(eventId)}/invitations`,
    { inviteeId, ...(slotId !== undefined ? { slotId } : {}) }
  );
  return data;
}

export async function acceptEventInvitation(eventId: string, invitationId: string): Promise<EventInvitation> {
  const { data } = await apiClient.post<EventInvitation>(
    `/events/${encodeURIComponent(eventId)}/invitations/${encodeURIComponent(invitationId)}/accept`
  );
  return data;
}

export async function declineEventInvitation(eventId: string, invitationId: string): Promise<EventInvitation> {
  const { data } = await apiClient.post<EventInvitation>(
    `/events/${encodeURIComponent(eventId)}/invitations/${encodeURIComponent(invitationId)}/decline`
  );
  return data;
}

export async function getPendingInvitations(): Promise<EventInvitation[]> {
  const { data } = await apiClient.get<EventInvitation[]>('/invitations/pending');
  return data ?? [];
}

export async function getEventPositions(eventId: string, callerId?: string): Promise<LiveSlot[]> {
  const base = `/events/${encodeURIComponent(eventId)}/positions`;
  const url = callerId ? `${base}?callerId=${encodeURIComponent(callerId)}` : base;
  const { data } = await apiClient.get<LiveSlot[]>(url);
  return data;
}

export async function claimEventPosition(
  eventId: string,
  slotId: string,
  callerId: string,
  extras?: { friendName?: string; friendUserId?: string }
): Promise<void> {
  await apiClient.post(
    `/events/${encodeURIComponent(eventId)}/positions/${encodeURIComponent(slotId)}/claim`,
    { callerId, ...extras }
  );
}

export async function releaseEventPosition(eventId: string, slotId: string): Promise<void> {
  await apiClient.post(
    `/events/${encodeURIComponent(eventId)}/positions/${encodeURIComponent(slotId)}/release`,
    {}
  );
}

// ─── Join requests ────────────────────────────────────────────────────────────

/** Response from POST /events/{id}/requests */
export type JoinRequest = {
  requestId: string;
  eventId: string;
  requesterId: string;
  slotId: string | null;
  status: 'pending';
  createdAt: string;
  resolvedAt: string | null;
};

/** One requester row inside a SlotRequestGroup */
export type SlotRequestRow = {
  requestId: string;
  requesterId: string;
  displayName: string;
  avatarUrl: string | null;
  reliabilityTier: 'excellent' | 'good' | 'at_risk' | 'unreliable';
  requestedAt: string;
  previouslyDeclined: boolean;
};

/** One group in the GET /events/{id}/requests response, keyed by slot */
export type SlotRequestGroup = {
  slotId: string | null;
  team: string | null;
  role: string | null;
  requests: SlotRequestRow[];
};

export async function requestSlot(
  eventId: string,
  requesterId: string,
  slotId?: string
): Promise<JoinRequest> {
  const { data } = await apiClient.post<JoinRequest>(
    `/events/${encodeURIComponent(eventId)}/requests`,
    { requesterId, ...(slotId !== undefined ? { slotId } : {}) }
  );
  return data;
}

export async function withdrawRequest(
  eventId: string,
  requestId: string,
  callerId: string
): Promise<void> {
  await apiClient.post(
    `/events/${encodeURIComponent(eventId)}/requests/${encodeURIComponent(requestId)}/withdraw`,
    { callerId }
  );
}

export async function acceptRequest(
  eventId: string,
  requestId: string,
  callerId: string
): Promise<void> {
  await apiClient.post(
    `/events/${encodeURIComponent(eventId)}/requests/${encodeURIComponent(requestId)}/accept`,
    { callerId }
  );
}

export async function declineRequest(
  eventId: string,
  requestId: string,
  callerId: string
): Promise<void> {
  await apiClient.post(
    `/events/${encodeURIComponent(eventId)}/requests/${encodeURIComponent(requestId)}/decline`,
    { callerId }
  );
}

/** Host-only. Returns pending requests grouped by slot. */
export async function getSlotRequests(
  eventId: string,
  callerId: string
): Promise<SlotRequestGroup[]> {
  const { data } = await apiClient.get<SlotRequestGroup[]>(
    `/events/${encodeURIComponent(eventId)}/requests?callerId=${encodeURIComponent(callerId)}`
  );
  return data;
}

// ─── Participant status ───────────────────────────────────────────────────────

export type ParticipantStatus = {
  userId: string;
  status: 'Registered' | 'Attended' | 'NoShow' | 'CancelledEarly' | 'CancelledLate';
  statusUpdatedAt: string | null;
};

/** Returns null on 404 (caller is not a participant); rethrows other errors. */
export async function getParticipantStatus(
  eventId: string,
  userId: string
): Promise<ParticipantStatus | null> {
  try {
    const { data } = await apiClient.get<ParticipantStatus>(
      `/events/${encodeURIComponent(eventId)}/participants/${encodeURIComponent(userId)}`
    );
    return data;
  } catch (err) {
    if (isHttpError(err, 404)) return null;
    throw err;
  }
}

// ─── Check-in ─────────────────────────────────────────────────────────────────

export type CheckInPayload = {
  userId: string;
  latitude: number;
  longitude: number;
  /** Optional GPS accuracy in meters — backend may use for diagnostics. */
  accuracyMeters?: number;
};

export type CheckInResponse = {
  eventId: string;
  userId: string;
  status: string;
  attendanceStatus?: string;
  verificationMethod?: string | null;
  statusUpdatedAt: string;
  distanceMeters: number;
};

export type CheckInTooFarBody = {
  message: string;
  distanceMeters: number;
  radiusMeters: number;
  venueName: string;
};

export type ManualAttendancePayload = {
  hostUserId: string;
  targetUserId: string;
  /** Present | Absent | Excused */
  status: 'Present' | 'Absent' | 'Excused';
};

export type ManualAttendanceResponse = {
  eventId: string;
  userId: string;
  attendanceStatus: string;
  verificationMethod: string;
  verifiedByUserId: string;
  verifiedAt: string;
};

/**
 * Narrows a 400 error to the too-far shape by detecting distanceMeters in the
 * body — never by matching message text, per the backend contract.
 */
export function isCheckInTooFar(
  error: unknown
): error is { response: { status: 400; data: CheckInTooFarBody } } {
  return (
    isApiError(error) &&
    error.response?.status === 400 &&
    typeof (error.response?.data as Record<string, unknown>)?.distanceMeters === 'number'
  );
}

export async function checkInToEvent(
  eventId: string,
  payload: CheckInPayload
): Promise<CheckInResponse> {
  const { data } = await apiClient.post<CheckInResponse>(
    `/events/${encodeURIComponent(eventId)}/checkin`,
    payload
  );
  return data;
}

/** Alias used by live cards — same as getEventLive (attendance lives on /live). */
export async function getEventAttendance(
  eventId: string,
  userId?: string
): Promise<LiveEventResponse> {
  return getEventLive(eventId, userId);
}

/**
 * Host manual attendance for one participant (GPS unavailable / offline peer).
 * Backend: POST /events/{id}/attendance/manual — host only.
 */
export async function confirmParticipantAttendance(
  eventId: string,
  payload: ManualAttendancePayload
): Promise<ManualAttendanceResponse> {
  const { data } = await apiClient.post<ManualAttendanceResponse>(
    `/events/${encodeURIComponent(eventId)}/attendance/manual`,
    payload
  );
  return data;
}

/** Mark a participant absent via the same manual endpoint (host only). */
export async function markParticipantAbsent(
  eventId: string,
  hostUserId: string,
  targetUserId: string
): Promise<ManualAttendanceResponse> {
  return confirmParticipantAttendance(eventId, {
    hostUserId,
    targetUserId,
    status: 'Absent',
  });
}

export async function confirmEventAttendance(
  eventId: string,
  payload: ConfirmAttendancePayload
): Promise<{ eventId: string; attended: number; noShows: number }> {
  const { data } = await apiClient.post<{ eventId: string; attended: number; noShows: number }>(
    `/events/${encodeURIComponent(eventId)}/attendance`,
    payload
  );
  return data;
}

export async function getEventLive(
  eventId: string,
  userId?: string
): Promise<LiveEventResponse> {
  const path = `/events/${encodeURIComponent(eventId)}/live`;
  const { data } = await apiClient.get<LiveEventResponse>(path, {
    params: userId ? { userId } : undefined,
  });
  return data;
}

export async function getEventResult(eventId: string): Promise<EventResultSummary> {
  const path = `/events/${encodeURIComponent(eventId)}/results`;
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.log('[ShowUp:result] GET', path, {
      eventId,
      hasAuth: Boolean(authToken),
    });
  }
  try {
    const res = await apiClient.get<EventResultSummary>(path);
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.log('[ShowUp:result] GET ok', {
        status: res.status,
        resultId: res.data?.resultId,
        resultStatus: res.data?.status,
        summary: res.data?.summary,
      });
    }
    return normalizeIncomingResult(res.data);
  } catch (error) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      const status = isApiError(error) ? error.response?.status : undefined;
      console.log('[ShowUp:result] GET fail', { eventId, status, message: getResultApiErrorMessage(error) });
    }
    throw error;
  }
}

function sanitizeResultPayloadForLog(payload: SubmitEventResultPayload) {
  return {
    submittedByUserId: payload.submittedByUserId ? '[userId]' : '',
    sideALabel: payload.sideALabel,
    sideBLabel: payload.sideBLabel,
    scoreA: payload.scoreA,
    scoreB: payload.scoreB,
    sets: payload.sets,
    games: payload.games,
  };
}

function normalizeIncomingResult(data: EventResultSummary): EventResultSummary {
  const raw = data as EventResultSummary & { submittedBy?: string };
  return {
    ...data,
    resultId: data.resultId ?? '',
    submittedByUserId: data.submittedByUserId || raw.submittedBy || '',
    status: data.status ?? '',
  };
}

export async function submitEventResult(
  eventId: string,
  payload: SubmitEventResultPayload,
  meta?: { sport?: string }
): Promise<EventResultSummary> {
  const path = `/events/${encodeURIComponent(eventId)}/results`;
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.log('[ShowUp:result] POST', path, {
      eventId,
      sport: meta?.sport ?? null,
      hasAuth: Boolean(authToken),
      payload: sanitizeResultPayloadForLog(payload),
    });
  }
  try {
    const res = await apiClient.post<EventResultSummary>(path, payload);
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.log('[ShowUp:result] POST ok', {
        httpStatus: res.status,
        resultId: res.data?.resultId,
        resultStatus: res.data?.status,
        summary: res.data?.summary,
        unitsWonA: res.data?.unitsWonA,
        unitsWonB: res.data?.unitsWonB,
        scoreA: res.data?.scoreA,
        scoreB: res.data?.scoreB,
      });
    }
    return normalizeIncomingResult(res.data);
  } catch (error) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      const status = isApiError(error) ? error.response?.status : undefined;
      console.log('[ShowUp:result] POST fail', {
        eventId,
        httpStatus: status,
        message: getResultApiErrorMessage(error),
      });
    }
    throw error;
  }
}

export async function confirmEventResult(
  eventId: string,
  confirmedByUserId: string
): Promise<EventResultSummary> {
  const { data } = await apiClient.post<EventResultSummary>(
    `/events/${encodeURIComponent(eventId)}/results/confirm`,
    { confirmedByUserId }
  );
  return normalizeIncomingResult(data);
}

export async function disputeEventResult(
  eventId: string,
  disputedByUserId: string,
  reason?: string
): Promise<EventResultSummary> {
  const { data } = await apiClient.post<EventResultSummary>(
    `/events/${encodeURIComponent(eventId)}/results/dispute`,
    { disputedByUserId, reason }
  );
  return normalizeIncomingResult(data);
}

export default apiClient;
