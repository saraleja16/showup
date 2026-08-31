using ShowUpBackend.Models.Entities;

namespace ShowUpBackend.Services.Interfaces;

public interface ITokenService
{
    string CreateAccessToken(User user);
}
