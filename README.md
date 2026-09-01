# Student Management System

Static web application built for the Agile / DevOps lab. Planned in Jira,
version controlled with Git and GitHub, built by Jenkins, deployed with Docker.

All student records in this project are dummy data.

## Team

| Member | Jira issues |
|---|---|
| Dhruv | SMS-1, SMS-3 |
| Janhavi | SMS-2, SMS-8, SMS-9 |
| Mayank | SMS-6, SMS-7, SMS-10 |
| Prakriti | SMS-11 |

## Run locally

Open `index.html` in a browser. There is no build step.

## Run with Docker

```bash
docker build -t student-management .
docker run -p 8081:80 student-management
```

Then open <http://localhost:8081>.

Port 8081 is used because Jenkins already occupies 8080.

## Branch and merge order

Each story is developed on its own branch and merged into `main` through a
pull request reviewed by another team member. Branches must be merged in this
order, because they all modify `index.html` and `app.js`:

1. `feature/SMS-1-login`
2. `feature/SMS-3-view-list`
3. `feature/SMS-2-add-student`
4. `feature/SMS-6-search`
5. `feature/SMS-7-edit`
6. `feature/SMS-8-delete`
7. `feature/SMS-11-class-report`

## Jira from the command line

`tools/jira.js` reads and updates the Jira board over the REST API. Plain
Node, no dependencies and no build step.

```bash
node tools/jira.js issues SMS      # the whole board
node tools/jira.js issue SMS-11    # one card
node tools/jira.js help            # everything else
```

Credentials are deliberately not in this repo. Create an API token at
<https://id.atlassian.com/manage-profile/security/api-tokens> and put it in
`~/.jira.env`:

```
JIRA_BASE_URL=https://your-site.atlassian.net
JIRA_EMAIL=you@example.com
JIRA_API_TOKEN=your-token
```

They live outside the repo because the `Dockerfile` copies this whole
directory into the nginx web root, so anything committed here is served over
HTTP by the running container.

Commands that write to Jira print what they would do and change nothing until
you add `--yes`.

## Definition of done

A Jira card moves to Done only when all four hold:

1. Commit message begins with the issue key
2. Pull request reviewed by a teammate and merged into `main`
3. Jenkins build of `main` reports SUCCESS
4. Feature works in the running container at <http://localhost:8081>

_Automatic build verification: 28 Aug 2026 01:41_
