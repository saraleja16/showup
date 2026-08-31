using ShowUpBackend.Models.Entities;

namespace ShowUpBackend.Services.Interfaces;

public enum OtpSendResult
{
    Sent,
    AlreadyVerified,
    RateLimited,
    UnknownEmail
}

public enum OtpVerifyResult
{
    Success,
    AlreadyVerified,
    NoCodeIssued,
    Expired,
    IncorrectCode,
    TooManyAttempts,
    UnknownEmail
}

public interface IOtpService
{
    /// <summary>Issues a fresh verification code and emails it. Any previous code for this address stops working.</summary>
    Task<OtpSendResult> SendEmailVerificationAsync(string email, CancellationToken cancellationToken = default);

    /// <summary>Checks a submitted code and, on success, marks the user's email as verified.</summary>
    Task<(OtpVerifyResult Result, User? User)> VerifyEmailAsync(string email, string code, CancellationToken cancellationToken = default);
}
