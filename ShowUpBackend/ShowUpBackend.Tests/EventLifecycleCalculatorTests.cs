using ShowUpBackend.Models.DTOs;
using ShowUpBackend.Models.Entities;
using ShowUpBackend.Services;

namespace ShowUpBackend.Tests;

public class EventLifecycleCalculatorTests
{
    private static Event Ev(DateTime start, string sport = "tennis", string? details = null) => new()
    {
        Id = Guid.NewGuid(),
        Sport = sport,
        ScheduledAt = start,
        SportDetails = details ?? """{"sessionType":"match","durationMinutes":60}"""
    };

    [Fact]
    public void Upcoming_before_starting_soon_window()
    {
        var start = new DateTime(2026, 8, 10, 12, 0, 0, DateTimeKind.Utc);
        var now = start.AddMinutes(-30);
        Assert.Equal(EventLifecycleStatus.Upcoming,
            EventLifecycleCalculator.Calculate(Ev(start), now, null));
    }

    [Fact]
    public void StartingSoon_within_configured_threshold()
    {
        var start = new DateTime(2026, 8, 10, 12, 0, 0, DateTimeKind.Utc);
        var now = start.AddMinutes(-10);
        Assert.Equal(EventLifecycleStatus.StartingSoon,
            EventLifecycleCalculator.Calculate(Ev(start), now, null, startingSoonMinutes: 15));
    }

    [Fact]
    public void StartingSoon_respects_custom_threshold()
    {
        var start = new DateTime(2026, 8, 10, 12, 0, 0, DateTimeKind.Utc);
        var now = start.AddMinutes(-20);
        Assert.Equal(EventLifecycleStatus.Upcoming,
            EventLifecycleCalculator.Calculate(Ev(start), now, null, startingSoonMinutes: 15));
        Assert.Equal(EventLifecycleStatus.StartingSoon,
            EventLifecycleCalculator.Calculate(Ev(start), now, null, startingSoonMinutes: 30));
    }

    [Fact]
    public void Boundary_at_exact_start_is_Live()
    {
        var start = new DateTime(2026, 8, 10, 12, 0, 0, DateTimeKind.Utc);
        Assert.Equal(EventLifecycleStatus.Live,
            EventLifecycleCalculator.Calculate(Ev(start), start, null));
    }

    [Fact]
    public void Live_during_scheduled_period()
    {
        var start = new DateTime(2026, 8, 10, 12, 0, 0, DateTimeKind.Utc);
        var now = start.AddMinutes(20);
        Assert.Equal(EventLifecycleStatus.Live,
            EventLifecycleCalculator.Calculate(Ev(start), now, null));
    }

    [Fact]
    public void Boundary_at_exact_end_is_Finished()
    {
        var start = new DateTime(2026, 8, 10, 12, 0, 0, DateTimeKind.Utc);
        var end = start.AddMinutes(60);
        Assert.Equal(EventLifecycleStatus.Finished,
            EventLifecycleCalculator.Calculate(Ev(start), end, null));
    }

    [Fact]
    public void Finished_after_end_without_result()
    {
        var start = new DateTime(2026, 8, 10, 12, 0, 0, DateTimeKind.Utc);
        var now = start.AddMinutes(90);
        Assert.Equal(EventLifecycleStatus.Finished,
            EventLifecycleCalculator.Calculate(Ev(start), now, null));
    }

    [Fact]
    public void ResultPending_when_unconfirmed_result_exists()
    {
        var start = new DateTime(2026, 8, 10, 12, 0, 0, DateTimeKind.Utc);
        var now = start.AddMinutes(90);
        var result = new EventResult { Status = EventResultStatus.PendingConfirmation };
        Assert.Equal(EventLifecycleStatus.ResultPending,
            EventLifecycleCalculator.Calculate(Ev(start), now, result));
    }

    [Fact]
    public void Completed_when_result_confirmed()
    {
        var start = new DateTime(2026, 8, 10, 12, 0, 0, DateTimeKind.Utc);
        var now = start.AddMinutes(90);
        var result = new EventResult { Status = EventResultStatus.Confirmed };
        Assert.Equal(EventLifecycleStatus.Completed,
            EventLifecycleCalculator.Calculate(Ev(start), now, result));
    }

    [Fact]
    public void Completed_for_non_scored_session_after_end()
    {
        var start = new DateTime(2026, 8, 10, 12, 0, 0, DateTimeKind.Utc);
        var now = start.AddMinutes(90);
        var ev = Ev(start, "tennis", """{"sessionType":"hitting","durationMinutes":60}""");
        Assert.Equal(EventLifecycleStatus.Completed,
            EventLifecycleCalculator.Calculate(ev, now, null));
    }

    [Fact]
    public void Timing_upcoming_has_seconds_until_start()
    {
        var start = new DateTime(2026, 8, 10, 12, 0, 0, DateTimeKind.Utc);
        var now = start.AddMinutes(-5);
        var snap = EventStatusProjection.Build(Ev(start), now, null, 15, false, false);
        Assert.Equal(EventLifecycleStatus.StartingSoon, snap.Status);
        Assert.Equal(0, snap.ElapsedSeconds);
        Assert.Equal(300, snap.RemainingSeconds);
        Assert.Equal(300, snap.SecondsUntilStart);
    }

    [Fact]
    public void Permissions_host_can_manage_attendance()
    {
        var start = new DateTime(2026, 8, 10, 12, 0, 0, DateTimeKind.Utc);
        var now = start.AddMinutes(10);
        var snap = EventStatusProjection.Build(Ev(start), now, null, 15, isHost: true, isActiveParticipant: true);
        Assert.True(snap.Permissions.CanManageAttendance);
        Assert.True(snap.Permissions.CanSubmitResult);
        Assert.False(snap.Permissions.CanConfirmResult);
    }

    [Fact]
    public void Permissions_unrelated_viewer_read_only()
    {
        var start = new DateTime(2026, 8, 10, 12, 0, 0, DateTimeKind.Utc);
        var now = start.AddMinutes(10);
        var perms = EventStatusProjection.ResolvePermissionsForViewer(
            Ev(start), now, null, viewerUserId: Guid.NewGuid(), isHost: false, isActiveParticipant: false);
        Assert.False(perms.CanSubmitResult);
        Assert.False(perms.CanConfirmResult);
        Assert.False(perms.CanDisputeResult);
        Assert.False(perms.CanManageAttendance);
    }

    [Fact]
    public void Permissions_submitter_cannot_confirm_own_result()
    {
        var start = new DateTime(2026, 8, 10, 12, 0, 0, DateTimeKind.Utc);
        var now = start.AddMinutes(90);
        var submitter = Guid.NewGuid();
        var result = new EventResult
        {
            Status = EventResultStatus.PendingConfirmation,
            SubmittedByUserId = submitter
        };
        var perms = EventStatusProjection.ResolvePermissionsForViewer(
            Ev(start), now, result, submitter, isHost: false, isActiveParticipant: true);
        Assert.False(perms.CanSubmitResult); // pending result locks normal submit
        Assert.False(perms.CanConfirmResult);
        Assert.False(perms.CanDisputeResult);
    }

    [Fact]
    public void Permissions_opponent_can_confirm_pending()
    {
        var start = new DateTime(2026, 8, 10, 12, 0, 0, DateTimeKind.Utc);
        var now = start.AddMinutes(90);
        var submitter = Guid.NewGuid();
        var opponent = Guid.NewGuid();
        var result = new EventResult
        {
            Status = EventResultStatus.PendingConfirmation,
            SubmittedByUserId = submitter
        };
        var perms = EventStatusProjection.ResolvePermissionsForViewer(
            Ev(start), now, result, opponent, isHost: false, isActiveParticipant: true);
        Assert.True(perms.CanConfirmResult);
        Assert.True(perms.CanDisputeResult);
        Assert.False(perms.CanManageAttendance);
    }
}
