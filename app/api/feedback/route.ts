import { NextRequest, NextResponse } from "next/server";

const LINEAR_API_URL = "https://api.linear.app/graphql";
const LINEAR_API_KEY = process.env.LINEAR_API_KEY;

export async function POST(req: NextRequest) {
  if (!LINEAR_API_KEY) {
    console.error("LINEAR_API_KEY not configured");
    return NextResponse.json(
      { error: "Feedback service not configured" },
      { status: 503 }
    );
  }

  try {
    const { title, description, type } = await req.json();

    if (!title || !description) {
      return NextResponse.json(
        { error: "Title and description are required" },
        { status: 400 }
      );
    }

    // First, get the team ID
    const teamsQuery = `
      query {
        teams {
          nodes {
            id
            name
          }
        }
      }
    `;

    const teamsResponse = await fetch(LINEAR_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: LINEAR_API_KEY,
      },
      body: JSON.stringify({ query: teamsQuery }),
    });

    const teamsData = await teamsResponse.json();

    if (!teamsData.data?.teams?.nodes?.length) {
      return NextResponse.json(
        { error: "No Linear teams found" },
        { status: 500 }
      );
    }

    const teamId = teamsData.data.teams.nodes[0].id;

    // Create the issue with witch@ prefix
    const feedbackType = type || "feedback";
    const issueTitle = `[witch@] ${feedbackType}: ${title}`;
    const issueDescription = `**Source:** Witch@\n**Type:** ${feedbackType}\n\n---\n\n${description}`;

    const createIssueQuery = `
      mutation CreateIssue($input: IssueCreateInput!) {
        issueCreate(input: $input) {
          success
          issue {
            id
            identifier
            url
          }
        }
      }
    `;

    const createResponse = await fetch(LINEAR_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: LINEAR_API_KEY,
      },
      body: JSON.stringify({
        query: createIssueQuery,
        variables: {
          input: {
            teamId,
            title: issueTitle,
            description: issueDescription,
          },
        },
      }),
    });

    const createData = await createResponse.json();

    if (createData.errors) {
      console.error("Linear API error:", createData.errors);
      return NextResponse.json(
        { error: "Failed to create feedback" },
        { status: 500 }
      );
    }

    if (!createData.data?.issueCreate?.success) {
      return NextResponse.json(
        { error: "Failed to create feedback" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      issue: createData.data.issueCreate.issue,
    });
  } catch (error) {
    console.error("Feedback API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
