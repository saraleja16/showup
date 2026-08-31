using System.ComponentModel.DataAnnotations;

namespace ShowUpBackend.Models.DTOs;

public class SendVerificationCodeRequest
{
    [Required]
    [EmailAddress]
    public string Email { get; set; } = string.Empty;
}

public class VerifyEmailRequest
{
    [Required]
    [EmailAddress]
    public string Email { get; set; } = string.Empty;

    [Required]
    [RegularExpression(@"^\d{6}$", ErrorMessage = "Code must be 6 digits")]
    public string Code { get; set; } = string.Empty;
}

public class SendVerificationCodeResponse
{
    /// <summary>Always true for a well-formed request — we never reveal whether an address is registered.</summary>
    public bool Sent { get; set; } = true;

    /// <summary>Seconds the client should wait before allowing another resend.</summary>
    public int RetryAfterSeconds { get; set; }

    public string Message { get; set; } = string.Empty;
}
