namespace ShowUpBackend.Models.DTOs;

public class ClaimPositionRequest
{
    /// <summary>The user making the request (self-claim or organizer pre-claim).</summary>
    public Guid CallerId { get; set; }

    /// <summary>
    /// Set when the organizer is pre-claiming a slot for a friend.
    /// When null, CallerId is claiming the slot for themselves.
    /// </summary>
    public string? FriendName { get; set; }

    /// <summary>Optional real user id for a friend who has an account.</summary>
    public Guid? FriendUserId { get; set; }
}
