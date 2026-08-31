using System.Text.Json.Serialization;

namespace ShowUpBackend.Models.DTOs;

public class LiveEventResponse
{
    public Guid EventId { get; set; }
    public string Sport { get; set; } = string.Empty;
    public DateTime ScheduledStart { get; set; }
    public DateTime ScheduledEnd { get; set; }
    public DateTime ServerNow { get; set; }
    public string Status { get; set; } = string.Empty;
    public int ElapsedSeconds { get; set; }
    public int? RemainingSeconds { get; set; }
    public int? SecondsUntilStart { get; set; }
    public int ParticipantCount { get; set; }
    public int PresentCount { get; set; }
    public int PendingCount { get; set; }
    public int AbsentCount { get; set; }
    public List<LiveParticipantDto> Participants { get; set; } = [];
    public EventResultSummaryDto? ResultSummary { get; set; }
    public EventPermissionsDto Permissions { get; set; } = new();
}

public class EventPermissionsDto
{
    public bool CanSubmitResult { get; set; }
    public bool CanConfirmResult { get; set; }
    public bool CanDisputeResult { get; set; }
    public bool CanManageAttendance { get; set; }
    /// <summary>True when caller can confirm at least one pending participant.</summary>
    public bool CanConfirmAttendance { get; set; }
}

public class LiveParticipantDto
{
    public Guid UserId { get; set; }
    public string DisplayName { get; set; } = string.Empty;
    public string? AvatarUrl { get; set; }
    public string AttendanceStatus { get; set; } = string.Empty;
    public string? VerificationMethod { get; set; }
    public DateTime? VerifiedAt { get; set; }
    public Guid? VerifiedByUserId { get; set; }
    public string? VerifiedByDisplayName { get; set; }
    /// <summary>Whether the current viewer may manually confirm this participant.</summary>
    public bool CanConfirmAttendance { get; set; }
}

public class ConfirmAttendanceRequest
{
    /// <summary>Optional when JWT is present; used for backward-compatible clients.</summary>
    public Guid? ConfirmedByUserId { get; set; }
}

public class EventResultSummaryDto
{
    public Guid ResultId { get; set; }
    public Guid EventId { get; set; }
    public string Status { get; set; } = string.Empty;
    public string Sport { get; set; } = string.Empty;
    public string Summary { get; set; } = string.Empty;
    public int? ScoreA { get; set; }
    public int? ScoreB { get; set; }
    public int? UnitsWonA { get; set; }
    public int? UnitsWonB { get; set; }
    /// <summary>Tennis / Volleyball set rows.</summary>
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public List<SideScoreDto>? Sets { get; set; }
    /// <summary>Pickleball game rows.</summary>
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public List<SideScoreDto>? Games { get; set; }
    public string? SideALabel { get; set; }
    public string? SideBLabel { get; set; }
    public Guid SubmittedByUserId { get; set; }
    /// <summary>Alias for clients that expect submittedBy.</summary>
    [JsonPropertyName("submittedBy")]
    public Guid SubmittedBy => SubmittedByUserId;
    public DateTime SubmittedAt { get; set; }
    public Guid? ConfirmedByUserId { get; set; }
    public DateTime? ConfirmedAt { get; set; }
    public Guid? DisputedByUserId { get; set; }
}

public class ManualAttendanceRequest
{
    public Guid HostUserId { get; set; }
    public Guid TargetUserId { get; set; }
    /// <summary>Present | Absent | Excused</summary>
    public string Status { get; set; } = "Present";
}

public class ManualAttendanceResponse
{
    public Guid EventId { get; set; }
    public Guid UserId { get; set; }
    public string AttendanceStatus { get; set; } = string.Empty;
    public string VerificationMethod { get; set; } = string.Empty;
    public Guid VerifiedByUserId { get; set; }
    public DateTime VerifiedAt { get; set; }
}

public class SubmitEventResultRequest
{
    public Guid SubmittedByUserId { get; set; }
    public string? SideALabel { get; set; }
    public string? SideBLabel { get; set; }

    /// <summary>Soccer only.</summary>
    public int? ScoreA { get; set; }
    public int? ScoreB { get; set; }

    /// <summary>Tennis / Volleyball set rows. Pickleball may also use this field.</summary>
    public List<SideScoreDto>? Sets { get; set; }

    /// <summary>Pickleball game rows (accepted as alias for Sets).</summary>
    public List<SideScoreDto>? Games { get; set; }
}

public class SideScoreDto
{
    [JsonPropertyName("sideA")]
    public int SideA { get; set; }

    [JsonPropertyName("sideB")]
    public int SideB { get; set; }
}

public class ConfirmEventResultRequest
{
    public Guid ConfirmedByUserId { get; set; }
}

public class DisputeEventResultRequest
{
    public Guid DisputedByUserId { get; set; }
    public string? Reason { get; set; }
}
