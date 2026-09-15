# ShowUp 🎾⚽🏐

ShowUp is a peer-to-peer sports app designed to make it easier to find people to play with.

Users can create and join local sports events, discover suitable players through matchmaking, chat, check in to games, and keep track of results.

ShowUp was developed as our university capstone project by Juan, Goraksha and Sara.

---

## What we built

- Create and join local sports events
- Support for Soccer, Tennis, Pickleball and Volleyball
- Player matchmaking based on sport, skill level, reliability and location
- Player discovery and recommendations
- Location-based event discovery
- In-app chat
- GPS-based game check-in
- Game results and attendance tracking
- Google authentication
- Email verification
- Profile photo uploads
- AI-assisted natural-language event search

---

## Player Matchmaking

One of the main ideas behind ShowUp is helping players find people who are a good fit for a particular game.

The matchmaking system considers factors such as:

- Sport
- Skill level
- Reliability
- Distance

Rather than simply showing nearby users, the system uses these factors to help identify players who are more suitable for a specific event.

---

## Tech Stack

### Mobile App

- React Native
- Expo
- TypeScript
- Expo Router

### Backend

- ASP.NET Core 8
- C#
- Entity Framework Core
- PostgreSQL
- Supabase

### Other Technologies

- Google Maps
- Google OAuth
- Firebase Cloud Messaging
- REST APIs

---

## My Contribution

I worked primarily on the frontend of ShowUp, while also contributing to integration, authentication, testing, debugging, and deployment across the application.

My main contributions included:

- Developing and refining frontend screens and reusable UI components using React Native, Expo, and TypeScript
- Implementing profile photo upload functionality
- Integrating Google authentication
- Adding and integrating multiple sports across the application
- Developing and improving the event creation experience
- Connecting frontend functionality with the ASP.NET Core backend APIs
- Testing and debugging authentication, event creation, user profiles, and other application flows
- Improving UI consistency, usability, responsiveness, and overall user experience
- Configuring and troubleshooting email verification and transactional email delivery
- Supporting the deployment and production configuration of the frontend and backend
- Configuring the production domain and resolving CORS and environment configuration issues
- Collaborating with the team to integrate, test, and refine frontend and backend functionality

Throughout the project, I gained hands-on experience working with a full-stack application from development and integration through to testing and production deployment.

---

## Testing the Project

ShowUp is deployed and can be tested directly through the production web application:

**Web Application:** https://showsups.com

The application is connected to the deployed ASP.NET Core backend and PostgreSQL database hosted through Supabase.

**Backend API:** https://showup-r5rr.onrender.com/api

**Swagger API Documentation:** https://showup-r5rr.onrender.com/swagger

### Local Development

The mobile application was developed using React Native and Expo and can be tested locally using Expo Go.

The web version can also be run locally through Expo for development and testing.

The current mobile project uses **Expo SDK 54**.

> **Note:** The production application uses the deployed Render backend and Supabase database, allowing the main functionality to be tested without running the project locally.

---

## What I Learned

This was my second software project of this scale, and it pushed me well outside of what I was comfortable with at the beginning.

Working on ShowUp gave me more practical experience with React Native, Expo, APIs, authentication, databases, Git, and working with a larger codebase as part of a team.

It also taught me a lot about the less visible parts of building an application — debugging issues, connecting different services, fixing small problems that appear along the way, and making sure different parts of the system work together.

There are still things I would improve, particularly around deployment, scalability and some areas of the user experience, but getting the application from an initial idea to a working product was a valuable part of the process.

---

## Future Improvements

Some areas I would like to explore further include:

- Public deployment for easier testing
- Native Google authentication for mobile
- Further improvements to the matchmaking system
- More sports and event types
- Continued UI/UX refinement
- Improved scalability and production infrastructure

---

## Project

Built as part of our Bachelor of Information Technology capstone project.

### Team

- Sara Cubillos
- Juan Rios
- Goraksha Pratap
