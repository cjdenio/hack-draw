import { config } from "dotenv";
config();

import { Server } from "socket.io";
import http from "http";
import express from "express";
import cookieSession from "cookie-session";
import axios from "axios";
import { URLSearchParams } from "url";
import { readFileSync } from "fs";

// State
let lines = [];

// Initialization
const whitelist = JSON.parse(readFileSync("./src/whitelist.json"));

const app = express();

const server = http.createServer(app);

const io = new Server(server);
const drawNamespace = io.of("/draw");

const wrap = (middleware) => (socket, next) =>
  middleware(socket.request, {}, next);

// Socket stuff
drawNamespace.use(
  wrap(
    cookieSession({
      keys: [process.env.SESSION_SECRET],
    })
  )
);
drawNamespace.use((socket, next) => {
  if (
    !socket.request.session.user ||
    !whitelist.includes(socket.request.session.user)
  ) {
    next(new Error("not authed"));
  } else {
    socket.data.user = socket.request.session.user;
    socket.data.userName = socket.request.session.userName;
    next();
  }
});

async function updateUsers() {
  const sockets = await drawNamespace.fetchSockets();

  drawNamespace.emit(
    "users",
    sockets.reduce((acc, curr) => {
      return {
        ...acc,
        [curr.data.userName]: curr.data.color,
      };
    }, {})
  );
}

drawNamespace.on("connection", (socket) => {
  const colors = [
    "rgb(100, 100, 100)",
    "rgb(0, 0, 0)",
    "rgb(255, 0, 0)",
    "rgb(0, 255, 0)",
    "rgb(0, 100, 255)",
    "rgb(255, 0, 255)",
    "rgb(255, 100, 0)",
    "rgb(0, 255, 255)",
  ];

  const color = colors[Math.floor(Math.random() * colors.length)];
  socket.data.color = color;

  updateUsers();

  socket.emit("init", lines);
  socket.emit("color", color);

  socket.on("draw", (data) => {
    lines.push(data);

    socket.broadcast.emit("draw", data);
    io.emit("draw", data);
  });

  socket.on("clear", (data) => {
    lines = [];

    io.emit("init", []);
    drawNamespace.emit("init", []);
  });

  socket.on("disconnect", () => {
    updateUsers();
  });
});

io.on("connection", (socket) => {
  socket.emit("init", lines);
});

// Web stuff
app.set("view engine", "ejs");
app.use(express.static("public"));
app.use(
  cookieSession({
    keys: [process.env.SESSION_SECRET],
  })
);

app.get("/", (req, res, next) => {
  if (!req.session.user || !whitelist.includes(req.session.user)) {
    res.render("login", { client_id: process.env.SLACK_CLIENT_ID });
  } else {
    res.render("draw");
  }
});

app.get("/callback", async (req, res) => {
  const { code } = req.query;

  try {
    const {
      data: {
        authed_user: { access_token },
      },
    } = await axios.post(
      "https://slack.com/api/oauth.v2.access",
      new URLSearchParams({
        client_id: process.env.SLACK_CLIENT_ID,
        client_secret: process.env.SLACK_CLIENT_SECRET,
        code,
      }).toString()
    );

    if (!access_token) {
      throw new Error("aa");
    }

    const {
      data: { user },
    } = await axios("https://slack.com/api/users.identity", {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    });

    if (whitelist.includes(user.id)) {
      req.session.user = user.id;
      req.session.userName = user.name;
      res.redirect("/");
    } else {
      res.send(
        "Uh oh, it looks like you haven't been whitelisted! Ping @Caleb in Slack to get added."
      );
    }
  } catch (e) {
    console.log(e);
    res.send("uh oh, something went wrong. please try again.");
  }
});

server.listen(3000, () => {
  console.log("app started");
});
