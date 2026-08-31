using System.Text.Json.Serialization;

namespace ShowUpBackend.Models.DTOs;

public class ProfilePortfolioResponse
{
    public ProfileStatsDto Stats { get; set; } = null!;
    public List<PortfolioGameDto> Played { get; set; } = [];
    public List<PortfolioGameDto> Hosted { get; set; } = [];
    public List<PortfolioGameDto> UpcomingGames { get; set; } = [];
}

public class PortfolioGamesPageResponse
{
    public string Type { get; set; } = string.Empty;
    public int Total { get; set; }
    public int Page { get; set; }
    public int PageSize { get; set; }
    public List<PortfolioGameDto> Items { get; set; } = [];
}

public class PortfolioGameDto
{
    public Guid EventId { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Sport { get; set; } = string.Empty;
    public string? VenueName { get; set; }
    public DateTime ScheduledStart { get; set; }
    public DateTime ScheduledEnd { get; set; }
    public DateTime ServerNow { get; set; }
    /// <summary>Upcoming | StartingSoon | Live | Finished | ResultPending | Completed</summary>
    public string EventStatus { get; set; } = string.Empty;
    /// <summary>Alias for EventStatus — same authoritative shared status.</summary>
    public string Status { get; set; } = string.Empty;
    public int ElapsedSeconds { get; set; }
    public int? RemainingSeconds { get; set; }
    public int? SecondsUntilStart { get; set; }
    public bool IsHost { get; set; }
    public int ParticipantCount { get; set; }
    public int PresentCount { get; set; }
    public int PendingCount { get; set; }
    public int AbsentCount { get; set; }

    public List<PortfolioParticipantDto> Participants { get; set; } = [];
    public PortfolioSideDto? SideA { get; set; }
    public PortfolioSideDto? SideB { get; set; }
    public string? UserSide { get; set; }

    public PortfolioResultDto? Result { get; set; }
    /// <summary>Win | Loss | Draw | Pending | null when no scored result applies.</summary>
    public string? UserOutcome { get; set; }

    public string? AttendanceVerificationLabel { get; set; }
    public EventPermissionsDto Permissions { get; set; } = new();
}

public class PortfolioParticipantDto
{
    public Guid UserId { get; set; }
    public string DisplayName { get; set; } = string.Empty;
    public string? AvatarUrl { get; set; }
    public string AttendanceStatus { get; set; } = string.Empty;
    public string? VerificationMethod { get; set; }
    public string? VerificationLabel { get; set; }
    public string? Side { get; set; }
    public bool IsHost { get; set; }
}

public class PortfolioSideDto
{
    public string Side { get; set; } = string.Empty;
    public string? Label { get; set; }
    public List<PortfolioParticipantDto> Participants { get; set; } = [];
}

public class PortfolioResultDto
{
    public Guid ResultId { get; set; }
    public string Status { get; set; } = string.Empty;
    public string Sport { get; set; } = string.Empty;
    public string Summary { get; set; } = string.Empty;
    public string? WinnerSide { get; set; }
    public int? ScoreA { get; set; }
    public int? ScoreB { get; set; }
    public int? SideAWins { get; set; }
    public int? SideBWins { get; set; }
    public List<SideScoreDto>? Sets { get; set; }
    public List<SideScoreDto>? Games { get; set; }
    public string? SideALabel { get; set; }
    public string? SideBLabel { get; set; }
}

public static class PortfolioGameType
{
    public const string Played = "played";
    public const string Hosted = "hosted";
    public const string Upcoming = "upcoming";
}

public static class PortfolioUserOutcome
{
    public const string Win = "Win";
    public const string Loss = "Loss";
    public const string Draw = "Draw";
    public const string Pending = "Pending";
}
