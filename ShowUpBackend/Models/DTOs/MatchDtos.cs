using System.Text.Json.Serialization;

namespace ShowUpBackend.Models.DTOs;

public class MatchCandidateDto
{
    [JsonPropertyName("userId")]
    public Guid UserId { get; set; }

    [JsonPropertyName("displayName")]
    public string DisplayName { get; set; } = string.Empty;

    [JsonPropertyName("profileImageUrl")]
    public string? ProfileImageUrl { get; set; }

    [JsonPropertyName("reliabilityScore")]
    public int ReliabilityScore { get; set; }

    [JsonPropertyName("skillLevel")]
    public string SkillLevel { get; set; } = string.Empty;

    [JsonPropertyName("sharedSports")]
    public List<string> SharedSports { get; set; } = [];

    [JsonPropertyName("primarySharedSport")]
    public string PrimarySharedSport { get; set; } = string.Empty;

    [JsonPropertyName("approximateDistanceKm")]
    public double ApproximateDistanceKm { get; set; }

    [JsonPropertyName("isConnectionPending")]
    public bool IsConnectionPending { get; set; }
}

public class MatchCandidatesResponse
{
    [JsonPropertyName("items")]
    public List<MatchCandidateDto> Items { get; set; } = [];

    [JsonPropertyName("nextCursor")]
    public string? NextCursor { get; set; }

    [JsonPropertyName("pageSize")]
    public int PageSize { get; set; }
}

public class MatchActionResponse
{
    [JsonPropertyName("success")]
    public bool Success { get; set; }

    [JsonPropertyName("isMutualMatch")]
    public bool IsMutualMatch { get; set; }

    [JsonPropertyName("connectionId")]
    public Guid? ConnectionId { get; set; }

    /// <summary>MatchDecision id for the caller's directional Connect when pending.</summary>
    [JsonPropertyName("requestId")]
    public Guid? RequestId { get; set; }
}

public class UpdateLocationRequest
{
    [JsonPropertyName("latitude")]
    public double Latitude { get; set; }

    [JsonPropertyName("longitude")]
    public double Longitude { get; set; }
}

public class UpdateSkillLevelRequest
{
    [JsonPropertyName("skillLevel")]
    public string SkillLevel { get; set; } = string.Empty;
}

// ── Discovery (search-driven, non-algorithmic match selection) ─────────────────

public class UserSearchResultDto
{
    [JsonPropertyName("userId")]
    public Guid UserId { get; set; }

    [JsonPropertyName("displayName")]
    public string DisplayName { get; set; } = string.Empty;

    [JsonPropertyName("username")]
    public string Username { get; set; } = string.Empty;

    [JsonPropertyName("profileImageUrl")]
    public string? ProfileImageUrl { get; set; }

    [JsonPropertyName("skillLevel")]
    public string? SkillLevel { get; set; }

    [JsonPropertyName("isConnected")]
    public bool IsConnected { get; set; }

    [JsonPropertyName("isConnectionPending")]
    public bool IsConnectionPending { get; set; }
}

public class UserSearchResponse
{
    [JsonPropertyName("items")]
    public List<UserSearchResultDto> Items { get; set; } = [];
}

// ── My matches (connections list + unmatch) ─────────────────────────────────────

public class ConnectionDto
{
    [JsonPropertyName("connectionId")]
    public Guid ConnectionId { get; set; }

    [JsonPropertyName("userId")]
    public Guid UserId { get; set; }

    [JsonPropertyName("displayName")]
    public string DisplayName { get; set; } = string.Empty;

    [JsonPropertyName("profileImageUrl")]
    public string? ProfileImageUrl { get; set; }

    [JsonPropertyName("skillLevel")]
    public string? SkillLevel { get; set; }

    [JsonPropertyName("connectedAt")]
    public DateTime ConnectedAt { get; set; }
}

// ── Connection requests (built on MatchDecisions) ───────────────────────────────

public static class MatchRequestStatus
{
    public const string Pending = "Pending";
    public const string Accepted = "Accepted";
    public const string Rejected = "Rejected";
    public const string Cancelled = "Cancelled";
}

public class MatchRequestUserDto
{
    [JsonPropertyName("id")]
    public Guid Id { get; set; }

    [JsonPropertyName("displayName")]
    public string DisplayName { get; set; } = string.Empty;

    [JsonPropertyName("avatarUrl")]
    public string? AvatarUrl { get; set; }

    [JsonPropertyName("preferredSports")]
    public List<string> PreferredSports { get; set; } = [];

    [JsonPropertyName("skillLevel")]
    public string? SkillLevel { get; set; }

    [JsonPropertyName("reliabilityScore")]
    public int? ReliabilityScore { get; set; }
}

public class MatchRequestDto
{
    [JsonPropertyName("requestId")]
    public Guid RequestId { get; set; }

    /// <summary>Other party (target for sent, sender for incoming/rejected).</summary>
    [JsonPropertyName("user")]
    public MatchRequestUserDto User { get; set; } = null!;

    /// <summary>Alias for sent-list consumers that expect targetUser.</summary>
    [JsonPropertyName("targetUser")]
    public MatchRequestUserDto TargetUser { get; set; } = null!;

    [JsonPropertyName("status")]
    public string Status { get; set; } = MatchRequestStatus.Pending;

    [JsonPropertyName("createdAt")]
    public DateTime CreatedAt { get; set; }

    [JsonPropertyName("updatedAt")]
    public DateTime UpdatedAt { get; set; }
}

public class MatchRequestListResponse
{
    [JsonPropertyName("items")]
    public List<MatchRequestDto> Items { get; set; } = [];

    [JsonPropertyName("count")]
    public int Count { get; set; }
}

public class MatchRequestCountsDto
{
    [JsonPropertyName("incomingCount")]
    public int IncomingCount { get; set; }

    [JsonPropertyName("sentPendingCount")]
    public int SentPendingCount { get; set; }

    [JsonPropertyName("rejectedCount")]
    public int RejectedCount { get; set; }
}

public class MatchRequestActionResponse
{
    [JsonPropertyName("success")]
    public bool Success { get; set; }

    [JsonPropertyName("status")]
    public string Status { get; set; } = string.Empty;

    [JsonPropertyName("connectionId")]
    public Guid? ConnectionId { get; set; }

    [JsonPropertyName("requestId")]
    public Guid? RequestId { get; set; }
}
