namespace ShowUpBackend.Models.DTOs;

public class ReleasePositionRequest
{
    /// <summary>Must be the event creator or the slot's current claimant.</summary>
    public Guid CallerId { get; set; }
}
