namespace ShowUpBackend.Models.Entities;

/// <summary>
/// A one-time passcode sent to a user's email address.
/// The plaintext code is never persisted — only a SHA-256 hash of it.
/// </summary>
public class EmailOtp
{
    public Guid Id { get; set; }

    /// <summary>Owning user. Null is not expected today but kept nullable for future pre-registration flows.</summary>
    public Guid? UserId { get; set; }

    /// <summary>Normalized (trimmed, lowercased) email the code was sent to.</summary>
    public string Email { get; set; } = string.Empty;

    /// <summary>Base64 SHA-256 hash of the 6-digit code.</summary>
    public string CodeHash { get; set; } = string.Empty;

    /// <summary>What the code is for, e.g. "EmailVerification".</summary>
    public string Purpose { get; set; } = OtpPurposes.EmailVerification;

    public DateTime ExpiresAt { get; set; }

    /// <summary>Set once the code has been successfully redeemed. A consumed code can never be reused.</summary>
    public DateTime? ConsumedAt { get; set; }

    /// <summary>Number of failed verification attempts against this code.</summary>
    public int AttemptCount { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public User? User { get; set; }
}

public static class OtpPurposes
{
    public const string EmailVerification = "EmailVerification";
}
