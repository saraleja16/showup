namespace ShowUpBackend.Models.DTOs;

public class InitialClaimRequest
{
    /// <summary>Slot ID from the formation template, e.g. "a_mid_2".</summary>
    public string SlotId { get; set; } = string.Empty;

    /// <summary>Display name for the friend being pre-assigned to this slot.</summary>
    public string FriendName { get; set; } = string.Empty;

    /// <summary>Optional user ID if the friend has a ShowUp account.</summary>
    public Guid? FriendUserId { get; set; }
}
