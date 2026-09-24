# DeskThing Community (working name)

An independent community continuation of [DeskThing](https://github.com/ItsRiprod/DeskThing),
originally created by [Riprod](https://github.com/ItsRiprod). This fork is not affiliated with or
endorsed by the original project; fixes that apply upstream are offered back to it.
This fork is in development; public installers are not available yet.
See the [public launch plan](docs/PUBLIC_LAUNCH.md) for release gates, product
priorities, compatibility testing, and community ownership.

![Youtube Banner](https://github.com/user-attachments/assets/78aa432b-e86e-4945-9b57-931a7ae5c5cb)
![image](https://github.com/user-attachments/assets/4f4ee062-14df-49df-968a-d196746ef80f)

*Project links*

> 📘 Fork operations and service ownership are documented in [`docs/`](docs/).

> 💬 Community links are intentionally not assigned until this fork has its own moderation team.

> 🌐 Distribution links will be added after this fork has project-owned hosting and signing.

---
# ‼️DeskThing is free and open source under the MIT license.

---

# The DeskThing ✔️

*Let's begin, shall we?*

DeskThing turns Spotify's discontinued Car Thing into a configurable desk or vehicle
display backed by a desktop Electron server. This community fork focuses on reliable
device connections, privacy-first defaults, independently owned distribution services,
and a maintainable release process.

The original project was created by Riprod and remains attributed under the MIT license.
This fork does not claim ownership of the original project's accounts, domains, or
trademarks.

For development and testing, build from source using the instructions below.
End-user installation instructions will accompany the first public beta.
---
> The feature screenshots and setup video below are historical upstream references,
> not verified instructions or screenshots for this fork.
<details>
   <summary><h2>✨ Features</h2></summary>

<img src="readme_images/bar.svg" style="width: 100%;" alt="Click to see the source">

The DeskThing is a simple CarThing Chromium-based website that can communicate with a Desktop APP on your computer. The CarThing can:

Note: Not all of these are updated and are pending a revision. This is new as of v0.7.0

## Features
- ### All In One Package 📦
   - [X] Download apps directly from the Desktop App
   - [X] Manage and update the Car Thing's display
   - [X] Probably more - just check it out already

- ### Configurable Controls ⚙️
   - [X] Make any button do any function!
   - [X] Control audio with the top buttons, front buttons, back buttons, really whatever you want!
   - [X] Modify them from the Desktop UI
   - [X] Add more directly from apps! (Basically, you can do anything)
<img width="1369" height="874" alt="image" src="https://github.com/user-attachments/assets/5afb8396-d536-43ed-9a58-2bf9ae4ddc37" />
*The deskthing mappings page - will be updated in v0.12*

## App Highlights
<img width="1108" height="687" alt="image" src="https://github.com/user-attachments/assets/66e7e296-e2fe-4306-af1a-7cf59c88f9f3" />


- ### Spotify Integration 🎧
   - [X] Show currently listening (Album, Artist, Song name, album art)
   - [X] Control Spotify (Skip, pause, play, rewind, shuffle, repeat)
   - [X] Supports Podcasts too!
   - [X] Set Audio Output Source
<img width="4032" height="3024" alt="image" src="https://github.com/user-attachments/assets/26126fda-3b18-48c2-b223-bfbb80a655bb" />
*[LyrThing](https://github.com/espeon/LyrThing/) community app showing spotify lyrics by Espeon*

- ### Local Audio Control 🎧
   - [X] Show currently listening (Album, Artist, Song name, album art)
   - [X] Control Any Playing Media (Skip, pause, play, rewind, shuffle, repeat)

- ### Custom Apps
<img width="615" height="478" alt="image" src="https://github.com/user-attachments/assets/20d32ba4-6c10-472c-ae2f-7365e10735c1" />

*Gif uploaded via the Image Viewer app* 
</details>

---

<details>
   <summary>
      <h2>▶️ Setting Up</h2>
   </summary>

<img src="readme_images/bar.svg" style="width: 100%;" alt="Click to see the source">

### Detailed Setup Instructions

Updating this ReadMe with the updated flashing / installation instructions was tedious and led to confusion

So now, it is contained inside an easy youtube video

You can also check out the Additional Resources for further tutorials if you'd rather look there.

https://www.youtube.com/watch?v=iW2biAnq0n8

While older versions may work, this is recommended.

</details>

---

<details>
   <summary>
      <h2>🔨 Local Development</h2>
   </summary>

<img src="readme_images/bar.svg" style="width: 100%;" alt="Click to see the source">

### Local Development / Contribution
Node Version: >=v22.15.0
NPM Version: >=10.0.0

**Note:** Signed end-user installers are not published by this fork yet. Current builds are intended for development and testing.


1. Clone the repo
```sh
git clone <your-fork-url>
```

2. cd into the directory
```sh
cd ./deskthing/DeskThingServer
```

3. Install packages
```sh
npm ci
```

4. Run the development build
```sh
npm run dev
```

That's it, you should be off to the races! A few aspects of the app are different while in development, but nothing monumental. 

Before opening a pull request, run:
```sh
npm run verify
```

Optional self-hosted statistics, feedback, and supporter integrations are
documented in [`docs/SERVICE_CONFIGURATION.md`](docs/SERVICE_CONFIGURATION.md).

The architecture is
```
src/
   main/ // all of the server-end code
   preload/ // types and definitions for the IPC communication layer
   renderer/ // the GUI of the application
   shared/ // shared types between the frontend and backend that are local to the server (global types are in @deskthing/types)
```

`@deskthing/types` is installed from npm with the other dependencies. When developing
a compatible types fork locally, use npm's standard `npm link` workflow and keep the
linked version aligned with the range in `DeskThingServer/package.json`.

</details>

---

<details>
   <summary>
      <h2>🤝 Contributing</h2>
   </summary>

<img src="readme_images/bar.svg" style="width: 100%;" alt="Click to see the source">

Welcome contributions! Here's how to get started:

- **Reporting Issues:** Use GitHub Issues to report bugs or suggest features. Include details like OS, DeskThing version, and steps to reproduce.
- **Submitting Pull Requests:** Fork the repo, make changes on a feature branch, and submit a PR. Ensure code follows the project's style (e.g., TypeScript types from @deskthing/types or shared/ directory). For new features, include screenshots or demos if applicable.
- **Coding Standards:** Use ESLint/Prettier if configured. Test your changes locally before submitting.
- **Questions:** Open a discussion or issue in the repository that distributed your build.

</details>

---


## 📗 Additional Resources

- 🔧 [superbird-tool](https://github.com/Car-Thing-Hax-Community/superbird-tool) - This is the CarThing image that is being used. Be sure to either include this link or steps on how to flash the CarThing.
- 🐤 [superbird-custom-webapp](https://github.com/pajowu/superbird-custom-webapp/tree/main) - The React web app framework that this project started with.
- 🗨️ [Car Thing Hax Community Discord](https://discord.carth.ing/) - The discord where there is this project and so much more!


---


> For this fork, use repository discussions or issues so answers remain public and searchable.

<details>
<summary>
 <h2>Action Shots</h2>
</summary>
 
![2024-11-03 14-52-17 2024-11-03 14_54_36](https://github.com/user-attachments/assets/6df2992d-198e-44e7-a1eb-fc51c0888ee9)
![2024-11-03_14-49-12 2024-11-03_14_51_33](https://github.com/user-attachments/assets/8fbf94b7-68c4-4000-88f7-c45ea3a027f5)
![2024-11-03_14-54-50 2024-11-03_14_56_07](https://github.com/user-attachments/assets/358dbd9f-9b8f-4f4a-b6b2-cc3427b53d2d)


</details>

*Historical upstream sponsor acknowledgment*

![helium-badge](https://github.com/user-attachments/assets/f0256b3a-0a96-4ba9-ba8d-7c0a45aa0d68)

*This fork does not currently collect donations.*
