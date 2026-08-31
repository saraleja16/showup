using ShowUpBackend.Models.DTOs;
using ShowUpBackend.Services;

namespace ShowUpBackend.Tests;

public class SportResultValidatorTests
{
    [Fact]
    public void Soccer_2_3_valid()
    {
        var (ok, err, _, a, b, _, _, summary) = SportResultValidators.Validate("soccer", new SubmitEventResultRequest
        {
            ScoreA = 2,
            ScoreB = 3
        });
        Assert.True(ok, err);
        Assert.Equal(2, a);
        Assert.Equal(3, b);
        Assert.Equal("2 - 3", summary);
    }

    [Fact]
    public void Soccer_3_2_valid()
    {
        var (ok, err, _, a, b, _, _, summary) = SportResultValidators.Validate("soccer", new SubmitEventResultRequest
        {
            ScoreA = 3,
            ScoreB = 2
        });
        Assert.True(ok, err);
        Assert.Equal(3, a);
        Assert.Equal(2, b);
        Assert.Equal("3 - 2", summary);
    }

    [Fact]
    public void Soccer_2_2_draw_valid()
    {
        var (ok, err, _, a, b, _, _, _) = SportResultValidators.Validate("soccer", new SubmitEventResultRequest
        {
            ScoreA = 2,
            ScoreB = 2
        });
        Assert.True(ok, err);
        Assert.Equal(2, a);
        Assert.Equal(2, b);
    }

    [Fact]
    public void Tennis_2_0_valid()
    {
        var (ok, err, _, _, _, wonA, wonB, _) = SportResultValidators.Validate("tennis", new SubmitEventResultRequest
        {
            Sets =
            [
                new SideScoreDto { SideA = 6, SideB = 4 },
                new SideScoreDto { SideA = 6, SideB = 2 }
            ]
        });
        Assert.True(ok, err);
        Assert.Equal(2, wonA);
        Assert.Equal(0, wonB);
    }

    [Fact]
    public void Tennis_2_1_valid()
    {
        var (ok, err, _, _, _, wonA, wonB, _) = SportResultValidators.Validate("tennis", new SubmitEventResultRequest
        {
            Sets =
            [
                new SideScoreDto { SideA = 6, SideB = 4 },
                new SideScoreDto { SideA = 3, SideB = 6 },
                new SideScoreDto { SideA = 6, SideB = 2 }
            ]
        });
        Assert.True(ok, err);
        Assert.Equal(2, wonA);
        Assert.Equal(1, wonB);
    }

    [Fact]
    public void Tennis_invalid_set_structure()
    {
        var (ok, err, _, _, _, _, _, _) = SportResultValidators.Validate("tennis", new SubmitEventResultRequest
        {
            Sets =
            [
                new SideScoreDto { SideA = 6, SideB = 5 }
            ]
        });
        Assert.False(ok);
        Assert.False(string.IsNullOrWhiteSpace(err));
    }

    [Fact]
    public void Pickleball_2_0_valid()
    {
        var (ok, err, _, _, _, wonA, wonB, _) = SportResultValidators.Validate("pickleball", new SubmitEventResultRequest
        {
            Sets =
            [
                new SideScoreDto { SideA = 11, SideB = 7 },
                new SideScoreDto { SideA = 11, SideB = 9 }
            ]
        });
        Assert.True(ok, err);
        Assert.Equal(2, wonA);
        Assert.Equal(0, wonB);
    }

    [Fact]
    public void Pickleball_2_1_valid()
    {
        var (ok, err, _, _, _, wonA, wonB, _) = SportResultValidators.Validate("pickleball", new SubmitEventResultRequest
        {
            Sets =
            [
                new SideScoreDto { SideA = 11, SideB = 7 },
                new SideScoreDto { SideA = 8, SideB = 11 },
                new SideScoreDto { SideA = 11, SideB = 9 }
            ]
        });
        Assert.True(ok, err);
        Assert.Equal(2, wonA);
        Assert.Equal(1, wonB);
    }

    [Fact]
    public void Pickleball_invalid_structure()
    {
        var (ok, _, _, _, _, _, _, _) = SportResultValidators.Validate("pickleball", new SubmitEventResultRequest
        {
            Sets = [new SideScoreDto { SideA = 11, SideB = 10 }]
        });
        Assert.False(ok);
    }

    [Fact]
    public void Volleyball_valid_sets()
    {
        var (ok, err, _, _, _, wonA, wonB, _) = SportResultValidators.Validate("volleyball", new SubmitEventResultRequest
        {
            Sets =
            [
                new SideScoreDto { SideA = 25, SideB = 21 },
                new SideScoreDto { SideA = 22, SideB = 25 },
                new SideScoreDto { SideA = 25, SideB = 18 }
            ]
        });
        Assert.True(ok, err);
        Assert.Equal(2, wonA);
        Assert.Equal(1, wonB);
    }

    [Fact]
    public void Volleyball_invalid_set_structure()
    {
        var (ok, _, _, _, _, _, _, _) = SportResultValidators.Validate("volleyball", new SubmitEventResultRequest
        {
            Sets =
            [
                new SideScoreDto { SideA = 20, SideB = 18 }
            ]
        });
        Assert.False(ok);
    }

    [Fact]
    public void Unsupported_sport_rejected()
    {
        var (ok, err, _, _, _, _, _, _) = SportResultValidators.Validate("basketball", new SubmitEventResultRequest
        {
            ScoreA = 1,
            ScoreB = 0
        });
        Assert.False(ok);
        Assert.Contains("Unsupported", err ?? "", StringComparison.OrdinalIgnoreCase);
    }
}
