import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import type { EventItem, EventResultSummary, PortfolioGame } from '@/src/api';
import { LiveGameCardContent } from '@/src/components/LiveGameCardContent';
import { normalizeSportKey } from '@/lib/sport-match';

export type EventStatusVariant = 'my-games' | 'profile' | 'home' | 'detail' | 'map';

type BaseProps = {
  variant: EventStatusVariant;
  userId: string;
  readOnly?: boolean;
  initiallyExpanded?: boolean;
  onOpenDetail?: () => void;
  onResultChanged?: () => void;
};

export type EventStatusCardProps = BaseProps &
  (
    | { source: 'event'; event: EventItem; isHost?: boolean }
    | { source: 'portfolio'; game: PortfolioGame; mode?: 'played' | 'hosted' | 'upcoming' }
    | {
        source: 'manual';
        eventId: string;
        title: string;
        sport: string;
        scheduledAt: string;
        scheduledEnd?: string | null;
        locationLabel: string;
        playersLabel: string;
        isHost: boolean;
        myStatus?: EventItem['myStatus'];
        serverStatus?: string | null;
        seedResult?: EventResultSummary | null;
        presentCount?: number | null;
        participantCount?: number | null;
        seedEvent?: EventItem | null;
      }
  );

function portfolioResultToSummary(game: PortfolioGame): EventResultSummary | null {
  if (!game.result) return null;
  const r = game.result;
  return {
    resultId: r.resultId,
    status: r.status,
    sport: r.sport || game.sport,
    summary: r.summary,
    scoreA: r.scoreA,
    scoreB: r.scoreB,
    unitsWonA: r.sideAWins,
    unitsWonB: r.sideBWins,
    sets: r.sets ?? null,
    games: r.games ?? null,
    sideALabel: r.sideALabel,
    sideBLabel: r.sideBLabel,
    submittedByUserId: '',
    submittedAt: game.scheduledStart,
  };
}

/**
 * Shared live event card used across Profile, Home, My Games, Map, and Event details.
 */
export function EventStatusCard(props: EventStatusCardProps) {
  const router = useRouter();
  const openDetail = (id: string) => {
    if (props.onOpenDetail) {
      props.onOpenDetail();
      return;
    }
    router.push({ pathname: '/event/[id]', params: { id } });
  };

  let eventId: string;
  let title: string;
  let sport: string;
  let scheduledAt: string;
  let scheduledEnd: string | null | undefined;
  let locationLabel: string;
  let playersLabel: string;
  let isHost: boolean;
  let myStatus: EventItem['myStatus'];
  let serverStatus: string | null | undefined;
  let seedResult: EventResultSummary | null | undefined;
  let presentCount: number | null | undefined;
  let participantCount: number | null | undefined;
  let seedEvent: EventItem | null | undefined;
  let sportDetails: EventItem['sportDetails'];

  if (props.source === 'event') {
    const e = props.event;
    eventId = e.id;
    title = e.title;
    // Keep sport id for scoring payloads; label is only for display chrome.
    sport = normalizeSportKey(e.sport) || e.sport || 'Event';
    scheduledAt = e.scheduledAt;
    scheduledEnd = e.scheduledEnd;
    locationLabel = e.venueName ?? 'Venue TBC';
    playersLabel = `${e.participantCount ?? 0}/${e.maxPlayers ?? 0}`;
    isHost = props.isHost ?? e.creatorId === props.userId;
    myStatus = e.myStatus ?? (isHost ? 'Registered' : null);
    serverStatus = e.liveStatus;
    seedResult = e.resultSummary;
    presentCount = e.presentCount;
    participantCount = e.participantCount;
    seedEvent = e;
    sportDetails = e.sportDetails;
  } else if (props.source === 'portfolio') {
    const g = props.game;
    eventId = g.eventId;
    title = g.title;
    sport = normalizeSportKey(g.sport) || g.sport || 'Event';
    scheduledAt = g.scheduledStart;
    scheduledEnd = g.scheduledEnd;
    locationLabel = g.venueName ?? 'Venue TBC';
    playersLabel = String(g.participantCount);
    isHost = g.isHost;
    // For past games (played/hosted tabs) everyone is 'Attended' so result actions appear.
    // Upcoming games use 'Registered' since the game hasn't happened yet.
    myStatus = props.mode === 'upcoming' ? 'Registered' : 'Attended';
    serverStatus = g.eventStatus;
    seedResult = portfolioResultToSummary(g);
    presentCount = g.presentCount;
    participantCount = g.participantCount;
    seedEvent = null;
    sportDetails = null;
  } else {
    eventId = props.eventId;
    title = props.title;
    sport = normalizeSportKey(props.sport) || props.sport;
    scheduledAt = props.scheduledAt;
    scheduledEnd = props.scheduledEnd;
    locationLabel = props.locationLabel;
    playersLabel = props.playersLabel;
    isHost = props.isHost;
    myStatus = props.myStatus;
    serverStatus = props.serverStatus;
    seedResult = props.seedResult;
    presentCount = props.presentCount;
    participantCount = props.participantCount;
    seedEvent = props.seedEvent ?? null;
    sportDetails = props.seedEvent?.sportDetails ?? null;
  }

  const readOnly =
    props.readOnly ??
    (props.variant === 'home' || props.variant === 'map'
      ? !(isHost || Boolean(myStatus))
      : false);

  return (
    <View style={[styles.card, props.variant === 'detail' && styles.cardDetail]}>
      <LiveGameCardContent
        eventId={eventId}
        scheduledAt={scheduledAt}
        scheduledEnd={scheduledEnd}
        sport={sport}
        sportDetails={sportDetails}
        title={title}
        locationLabel={locationLabel}
        playersLabel={playersLabel}
        isHost={isHost}
        userId={props.userId}
        variant={props.variant}
        initiallyExpanded={props.initiallyExpanded ?? props.variant === 'detail'}
        onOpenDetail={() => openDetail(eventId)}
        myStatus={myStatus}
        seedEvent={seedEvent}
        readOnly={readOnly}
        serverStatus={serverStatus}
        seedResult={seedResult}
        presentCount={presentCount}
        participantCount={participantCount}
        onResultChanged={props.onResultChanged}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#162033',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(168, 255, 62, 0.18)',
    padding: 16,
    marginBottom: 12,
  },
  cardDetail: {
    marginBottom: 16,
  },
});
