using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using ShowUpBackend.Configuration;
using ShowUpBackend.Data;
using ShowUpBackend.Models.DTOs;
using ShowUpBackend.Models.Entities;
using ShowUpBackend.Services.Interfaces;

namespace ShowUpBackend.Services;

public class EventLiveService : IEventLiveService
{
    private readonly AppDbContext _db;
    private readonly INotificationService _notifications;
    private readonly EventLifecycleOptions _lifecycleOptions;
    private readonly AttendanceOptions _attendanceOptions;

    public EventLiveService(
        AppDbContext db,
        INotificationService notifications,
        IOptions<EventLifecycleOptions> lifecycleOptions,
        IOptions<AttendanceOptions> attendanceOptions)
    {
        _db = db;
        _notifications = notifications;
        _lifecycleOptions = lifecycleOptions.Value;
        _attendanceOptions = attendanceOptions.Value;
    }

    public async Task<(LiveEventResponse? Response, string? Error, int StatusCode)> GetLiveAsync(
        Guid eventId,
        Guid? viewerUserId = null)
    {
        var ev = await _db.Events.AsNoTracking().FirstOrDefaultAsync(e => e.Id == eventId);
        if (ev is null)
            return (null, "Event not found", 404);

        var participants = await _db.EventParticipants
            .AsNoTracking()
            .Where(p => p.EventId == eventId &&
                        p.Status != ParticipationStatus.CancelledEarly &&
                        p.Status != ParticipationStatus.CancelledLate)
            .Join(_db.Users.AsNoTracking(),
                p => p.UserId,
                u => u.Id,
                (p, u) => new { p, u })
            .ToListAsync();

        var result = await _db.EventResults.AsNoTracking()
            .FirstOrDefaultAsync(r => r.EventId == eventId);

        var now = DateTime.UtcNow;
        var soonMinutes = _lifecycleOptions.StartingSoonMinutes > 0
            ? _lifecycleOptions.StartingSoonMinutes
            : EventLifecycleCalculator.StartingSoonMinutes;

        var isHost = viewerUserId.HasValue && viewerUserId.Value == ev.CreatorId;
        var isActiveParticipant = viewerUserId.HasValue && (
            isHost || participants.Any(x => x.p.UserId == viewerUserId.Value));

        var snap = EventStatusProjection.Build(
            ev, now, result, soonMinutes, isHost, isActiveParticipant);
        snap = snap with
        {
            Permissions = EventStatusProjection.ResolvePermissionsForViewer(
                ev, now, result, viewerUserId, isHost, isActiveParticipant)
        };

        var verifierIds = participants
            .Where(x => x.p.VerifiedByUserId.HasValue)
            .Select(x => x.p.VerifiedByUserId!.Value)
            .Distinct()
            .ToList();
        var verifierNames = verifierIds.Count == 0
            ? new Dictionary<Guid, string>()
            : await _db.Users.AsNoTracking()
                .Where(u => verifierIds.Contains(u.Id))
                .ToDictionaryAsync(u => u.Id, u => u.DisplayName);

        var viewerPresent = viewerUserId.HasValue && participants.Any(x =>
            x.p.UserId == viewerUserId.Value &&
            x.p.Status == ParticipationStatus.Attended);
        var manualWindowOpen = IsManualConfirmationWindowOpen(ev, now);

        var liveParticipants = participants.Select(x =>
        {
            var attendance = LiveAttendanceStatus.FromParticipation(x.p.Status);
            var canConfirm = CanConfirmTarget(
                ev, viewerUserId, isHost, viewerPresent, manualWindowOpen,
                x.p.UserId, attendance);

            string? verifiedByName = null;
            if (x.p.VerifiedByUserId is Guid vid)
                verifierNames.TryGetValue(vid, out verifiedByName);

            return new LiveParticipantDto
            {
                UserId = x.u.Id,
                DisplayName = x.u.DisplayName,
                AvatarUrl = x.u.AvatarUrl,
                AttendanceStatus = attendance,
                VerificationMethod = x.p.VerificationMethod,
                VerifiedAt = x.p.StatusUpdatedAt,
                VerifiedByUserId = x.p.VerifiedByUserId,
                VerifiedByDisplayName = verifiedByName,
                CanConfirmAttendance = canConfirm
            };
        }).ToList();

        snap.Permissions.CanConfirmAttendance = liveParticipants.Any(p => p.CanConfirmAttendance);

        return (new LiveEventResponse
        {
            EventId = ev.Id,
            Sport = ev.Sport,
            ScheduledStart = snap.ScheduledStart,
            ScheduledEnd = snap.ScheduledEnd,
            ServerNow = snap.ServerNow,
            Status = snap.Status,
            ElapsedSeconds = snap.ElapsedSeconds,
            RemainingSeconds = snap.RemainingSeconds,
            SecondsUntilStart = snap.SecondsUntilStart,
            ParticipantCount = liveParticipants.Count,
            PresentCount = liveParticipants.Count(p => p.AttendanceStatus == LiveAttendanceStatus.Present),
            PendingCount = liveParticipants.Count(p => p.AttendanceStatus == LiveAttendanceStatus.Pending),
            AbsentCount = liveParticipants.Count(p =>
                p.AttendanceStatus is LiveAttendanceStatus.Absent or LiveAttendanceStatus.Excused),
            Participants = liveParticipants,
            ResultSummary = snap.ResultSummary,
            Permissions = snap.Permissions
        }, null, 200);
    }

    public async Task<(ManualAttendanceResponse? Response, string? Error, int StatusCode)> HostManualAttendanceAsync(
        Guid eventId, ManualAttendanceRequest request)
    {
        var ev = await _db.Events.FirstOrDefaultAsync(e => e.Id == eventId);
        if (ev is null)
            return (null, "Event not found", 404);

        if (request.HostUserId != ev.CreatorId)
            return (null, "Only the host can manually mark attendance", 403);

        var participant = await _db.EventParticipants
            .FirstOrDefaultAsync(p => p.EventId == eventId && p.UserId == request.TargetUserId);
        if (participant is null)
            return (null, "Target user is not a participant", 404);

        if (participant.Status is ParticipationStatus.CancelledEarly or ParticipationStatus.CancelledLate)
            return (null, "Cannot mark attendance for a cancelled participant", 400);

        var liveStatus = request.Status?.Trim() ?? LiveAttendanceStatus.Present;
        if (liveStatus is not (
            LiveAttendanceStatus.Present or LiveAttendanceStatus.Absent or LiveAttendanceStatus.Excused))
        {
            return (null, "Status must be Present, Absent, or Excused", 400);
        }

        var now = DateTime.UtcNow;
        participant.Status = LiveAttendanceStatus.ToParticipation(liveStatus);
        participant.StatusUpdatedAt = now;
        participant.VerificationMethod = AttendanceVerificationMethod.HostManual;
        participant.VerifiedByUserId = request.HostUserId;
        participant.DistanceMeters = null;

        await _db.SaveChangesAsync();

        if (participant.UserId != request.HostUserId)
        {
            await _notifications.SendPushNotificationToUserAsync(
                participant.UserId,
                "Attendance updated",
                "Your attendance was confirmed by the host.",
                "attendance_host_manual",
                eventId);
        }

        return (new ManualAttendanceResponse
        {
            EventId = eventId,
            UserId = participant.UserId,
            AttendanceStatus = liveStatus,
            VerificationMethod = AttendanceVerificationMethod.HostManual,
            VerifiedByUserId = request.HostUserId,
            VerifiedAt = now
        }, null, 200);
    }

    public async Task<(ManualAttendanceResponse? Response, string? Error, int StatusCode)> ConfirmParticipantAttendanceAsync(
        Guid eventId,
        Guid targetUserId,
        Guid confirmerUserId)
    {
        if (confirmerUserId == Guid.Empty)
            return (null, "Confirmer identity is required", 400);

        if (confirmerUserId == targetUserId)
            return (null, "Cannot confirm your own attendance", 403);

        var ev = await _db.Events.FirstOrDefaultAsync(e => e.Id == eventId);
        if (ev is null)
            return (null, "Event not found", 404);

        var now = DateTime.UtcNow;
        if (!IsManualConfirmationWindowOpen(ev, now))
            return (null, "Manual confirmation window is not open", 400);

        var target = await _db.EventParticipants
            .FirstOrDefaultAsync(p => p.EventId == eventId && p.UserId == targetUserId);
        if (target is null)
            return (null, "Target user is not a participant", 404);

        if (target.Status is ParticipationStatus.CancelledEarly or ParticipationStatus.CancelledLate)
            return (null, "Cannot confirm a cancelled participant", 400);

        // Idempotent: already Present.
        if (target.Status == ParticipationStatus.Attended)
        {
            return (new ManualAttendanceResponse
            {
                EventId = eventId,
                UserId = target.UserId,
                AttendanceStatus = LiveAttendanceStatus.Present,
                VerificationMethod = target.VerificationMethod ?? AttendanceVerificationMethod.HostManual,
                VerifiedByUserId = target.VerifiedByUserId ?? confirmerUserId,
                VerifiedAt = target.StatusUpdatedAt ?? now
            }, null, 200);
        }

        if (target.Status != ParticipationStatus.Registered)
            return (null, $"Target attendance cannot be confirmed from status {target.Status}", 400);

        var isHost = confirmerUserId == ev.CreatorId;
        string method;
        if (isHost)
        {
            method = AttendanceVerificationMethod.HostManual;
        }
        else
        {
            var confirmer = await _db.EventParticipants
                .AsNoTracking()
                .FirstOrDefaultAsync(p => p.EventId == eventId && p.UserId == confirmerUserId);
            if (confirmer is null)
                return (null, "Only event participants may confirm attendance", 403);
            if (confirmer.Status is ParticipationStatus.CancelledEarly or ParticipationStatus.CancelledLate)
                return (null, "Cancelled participants cannot confirm attendance", 403);
            if (confirmer.Status != ParticipationStatus.Attended)
                return (null, "Only Present participants may confirm others", 403);

            method = AttendanceVerificationMethod.ParticipantManual;
        }

        target.Status = ParticipationStatus.Attended;
        target.StatusUpdatedAt = now;
        target.VerificationMethod = method;
        target.VerifiedByUserId = confirmerUserId;
        target.DistanceMeters = null;
        await _db.SaveChangesAsync();

        var confirmerUser = await _db.Users.AsNoTracking()
            .FirstOrDefaultAsync(u => u.Id == confirmerUserId);
        var confirmerName = confirmerUser?.DisplayName ?? (isHost ? "the host" : "a teammate");

        await _notifications.SendPushNotificationToUserAsync(
            target.UserId,
            "Attendance confirmed",
            isHost
                ? "Your attendance was confirmed by the host."
                : $"{confirmerName} confirmed your attendance.",
            isHost ? "attendance_host_manual" : "attendance_participant_manual",
            eventId);

        return (new ManualAttendanceResponse
        {
            EventId = eventId,
            UserId = target.UserId,
            AttendanceStatus = LiveAttendanceStatus.Present,
            VerificationMethod = method,
            VerifiedByUserId = confirmerUserId,
            VerifiedAt = now
        }, null, 200);
    }

    private bool IsManualConfirmationWindowOpen(Event ev, DateTime utcNow)
    {
        var open = DateTime.SpecifyKind(ev.ScheduledAt, DateTimeKind.Utc)
            .AddMinutes(-Math.Max(0, _attendanceOptions.MinutesBeforeStart));
        var end = EventLifecycleCalculator.GetScheduledEnd(ev)
            .AddMinutes(Math.Max(0, _attendanceOptions.MinutesAfterEnd));
        return utcNow >= open && utcNow < end;
    }

    private static bool CanConfirmTarget(
        Event ev,
        Guid? viewerUserId,
        bool isHost,
        bool viewerPresent,
        bool manualWindowOpen,
        Guid targetUserId,
        string targetAttendance)
    {
        if (!viewerUserId.HasValue || !manualWindowOpen)
            return false;
        if (viewerUserId.Value == targetUserId)
            return false;
        if (targetAttendance != LiveAttendanceStatus.Pending)
            return false;
        if (isHost)
            return true;
        return viewerPresent;
    }
}
