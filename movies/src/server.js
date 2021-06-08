import express from "express";
import fetch from "node-fetch";
import verifyUserFactory from "./auth.js";
import limits from "./limits.js";
import db from "./db/db.js";

const PORT = 3001;
const { JWT_SECRET, OMDB_API_KEY } = process.env;

if (!JWT_SECRET) {
  throw new Error("Missing JWT_SECRET env var. Set it and restart the server");
}
if (!OMDB_API_KEY) {
  throw new Error("Missing OMDB_API_KEY env var. Set it and restart the server");
}

const verify = verifyUserFactory(JWT_SECRET);

const app = express();
app.use(express.json());
app.use(express.urlencoded({
  extended: true
}));

const movies = {};

const getOMDBData = async (omdbApiKey, title) => {
  const response = await fetch(`https://www.omdbapi.com/?apikey=${omdbApiKey}&t=${title}`);
  return await response.json();
};

const verifyUser = (req, res, next) => {
  const bearerHeader = req.headers["authorization"];
  if (bearerHeader) {
    const bearerToken = bearerHeader.split(" ")[1];
    try {
      res.locals.user = verify(bearerToken);
      next();
    } catch (err) {
      return res.status(401).json({ error: "Invalid or expired authentication token" });
    }
  } else {
    return res.status(401).json({ error: "Missing authentication token" });
  }
};

app.get("/movies", verifyUser, (req, res) => {
  return res.status(200).json({ movies: movies });
});

app.post("/movies", verifyUser, async (req, res) => {
  if (limits.isLimited(res.locals.user)) {
    return res.status(403).json({ error: "User reached quota limits"});
  }
  const title = req.body.title;
  if (!title || title.trim() === "") {
    return res.status(400).json({ error: "Title is a required body parameter" });
  }
  // call OMDB
  const omdbResult = await getOMDBData(OMDB_API_KEY, title);
  const movie = {
    Title: omdbResult.Title,
    Released: omdbResult.Released,
    Genre: omdbResult.Genre,
    Director: omdbResult.Director
  };

  movies[movie.Title] = movie;
  limits.decrementLimits(res.locals.user);
  return res.status(200).json(movie);
});

app.use((error, _, res, __) => {
  console.error(
    `Error processing request ${error}. See next message for details`
  );
  console.error(error);

  return res.status(500).json({ error: "internal server error" });
});

app.listen(PORT, () => {
  console.log(`movies svc running at port ${PORT}`);
});