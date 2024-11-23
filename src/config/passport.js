const passport = require("passport");
const SteamStrategy = require("passport-steam").Strategy;
const User = require("../models/User");
const jwt = require("jsonwebtoken");

passport.use(
  new SteamStrategy(
    {
      returnURL: `${process.env.BASE_URL}/auth/steam/return`,
      realm: process.env.BASE_URL,
      apiKey: process.env.STEAM_API_KEY,
    },
    async (identifier, profile, done) => {
      try {
        if (!profile._json || !profile._json.steamid) {
          return done(
            new Error("Steam profile is missing required data"),
            null
          );
        }
        const steamData = profile._json;

        let user = await User.findOne({ steamId: steamData.steamid });
        if (!user) {
          user = new User({
            steamId: steamData.steamid,
            personaname: steamData.personaname,
            profileUrl: steamData.profileurl,
            avatar: steamData.avatarfull,
            avatarhash: steamData.avatarhash,
            lastlogoff: steamData.lastlogoff,
            realname: steamData.realname || "Unknown",
            timecreated: steamData.timecreated,
            loccountrycode: steamData.loccountrycode || "Unknown",
            steamIdentifier: profile.id,
            displayName: profile.displayName,
            photos: profile.photos.map((photo) => photo.value),
            balance: 0,
            openedCases: 0,
            role: "admin",
          });

          await user.save();
        }

        const token = jwt.sign(
          { id: user._id, steamId: user.steamId, role: user.role },
          process.env.JWT_SECRET,
          { expiresIn: "7d" }
        );

        return done(null, { user, token });
      } catch (error) {
        console.error("❌ Error processing Steam login:", error.message);
        return done(error, null);
      }
    }
  )
);

module.exports = passport;
