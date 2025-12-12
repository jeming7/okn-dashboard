#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fetch from "node-fetch";

/**
 * OKN (Open Knowledge Network) MCP Server
 * 
 * This server provides MCP tools to query all knowledge graphs hosted on FRINK
 * at https://frink.apps.renci.org
 */

// All FRINK SPARQL endpoints
const FRINK_ENDPOINTS = {
  "biobricks-ice": {
    url: "https://frink.apps.renci.org/biobricks-ice/sparql",
    domain: "Cheminformatics and Chemical Safety",
    description: "Open knowledge graph for cheminformatics and chemical safety"
  },
  "biohealth": {
    url: "https://frink.apps.renci.org/biohealth/sparql",
    domain: "Healthcare and Social Determinants",
    description: "Dynamically-updated network integrating biomedical insights with social determinants of health"
  },
  "climatepub4kg": {
    url: "https://frink.apps.renci.org/climatepub4kg/sparql",
    domain: "Climate Science",
    description: "Knowledge graph to support evaluation and development of climate models"
  },
  "dreamkg": {
    url: "https://frink.apps.renci.org/dreamkg/sparql",
    domain: "Homelessness and Social Services",
    description: "Dynamic, Responsive, Adaptive, and Multifaceted KG to Address Homelessness with Explainable AI"
  },
  "fiokg": {
    url: "https://frink.apps.renci.org/fiokg/sparql",
    domain: "Food and Water Safety",
    description: "Part of SAWGraph project for monitoring contaminants in food and water systems"
  },
  "geoconnex": {
    url: "https://frink.apps.renci.org/geoconnex/sparql",
    domain: "Hydrology and Water Resources",
    description: "Community-driven KG linking U.S. hydrologic features for seamless water data discovery"
  },
  "hydrologykg": {
    url: "https://frink.apps.renci.org/hydrologykg/sparql",
    domain: "Hydrology",
    description: "Part of SAWGraph project focused on hydrological data"
  },
  "scales": {
    url: "https://frink.apps.renci.org/scales/sparql",
    domain: "Criminal Justice",
    description: "Integrated justice platform knowledge graph"
  },
  "securechainkg": {
    url: "https://frink.apps.renci.org/securechainkg/sparql",
    domain: "Software Supply Chain Security",
    description: "Knowledge graph for software supply chain security"
  },
  "semopenalex": {
    url: "https://frink.apps.renci.org/semopenalex/sparql",
    domain: "Scientific Publications",
    description: "Comprehensive information on scientific publications and related entities"
  },
  "sockg": {
    url: "https://frink.apps.renci.org/sockg/sparql",
    domain: "Soil Carbon",
    description: "Soil carbon modeling for voluntary carbon markets"
  },
  "spatialkg": {
    url: "https://frink.apps.renci.org/spatialkg/sparql",
    domain: "Spatial/Geographic Data",
    description: "Spatial and geographic knowledge graph"
  },
  "spoke": {
    url: "https://frink.apps.renci.org/spoke/sparql",
    domain: "Precision Medicine",
    description: "Scalable Precision Medicine Open Knowledge Engine integrating NASA GeneLab with health data"
  },
  "sudokn": {
    url: "https://frink.apps.renci.org/sudokn/sparql",
    domain: "Manufacturing Capabilities",
    description: "Manufacturing capability data for small and medium enterprises"
  },
  "ubergraph": {
    url: "https://frink.apps.renci.org/ubergraph/sparql",
    domain: "Biomedical Ontologies",
    description: "Integrated suite of OBO ontologies with precomputed inferred relationships"
  },
  "wildlifekg": {
    url: "https://frink.apps.renci.org/wildlifekg/sparql",
    domain: "Wildlife Management",
    description: "Wildlife management in the context of climate change"
  },
  "wikidata": {
    url: "https://frink.apps.renci.org/wikidata/sparql",
    domain: "Universal Knowledge Backbone",
    description: "Free, open, collaborative knowledge base (OKN backbone)"
  },
  "sawgraph": {
    url: "https://frink.apps.renci.org/sawgraph/sparql",
    domain: "Agricultural Safety and Water Quality",
    description: "Safe Agricultural Products and Water Graph - monitoring PFAS and contaminants"
  }
};

const FEDERATED_ENDPOINT = "https://frink.apps.renci.org/federation/sparql";

/**
 * Execute a SPARQL query against a specific endpoint
 */
async function executeSparqlQuery(endpoint, query, timeout = 30000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/sparql-query",
        "Accept": "application/sparql-results+json",
      },
      body: query,
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`Query timeout after ${timeout}ms`);
    }
    throw error;
  }
}

/**
 * Format SPARQL results into a readable table
 */
function formatResults(data) {
  if (!data.results || !data.results.bindings || data.results.bindings.length === 0) {
    return "No results found.";
  }

  const bindings = data.results.bindings;
  const vars = data.head.vars;

  // Create table header
  let table = vars.join(" | ") + "\n";
  table += vars.map(() => "---").join(" | ") + "\n";

  // Add rows (limit to first 100 for readability)
  const displayBindings = bindings.slice(0, 100);
  for (const binding of displayBindings) {
    const row = vars.map(v => {
      if (binding[v]) {
        return binding[v].value;
      }
      return "";
    });
    table += row.join(" | ") + "\n";
  }

  if (bindings.length > 100) {
    table += `\n(Showing first 100 of ${bindings.length} results)`;
  }

  return table;
}

// Initialize the MCP server
const server = new Server(
  {
    name: "okn-unified-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Handle tool listing
server.setRequestHandler(ListToolsRequestSchema, async () => {
  const tools = [
    {
      name: "list_knowledge_graphs",
      description: "List all available knowledge graphs in the Open Knowledge Network with their domains and descriptions",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "query_federated",
      description: "Execute a SPARQL query across all knowledge graphs in the OKN using federated querying",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "SPARQL query to execute across all graphs",
          },
        },
        required: ["query"],
      },
    },
  ];

  // Add a tool for each knowledge graph
  for (const [name, info] of Object.entries(FRINK_ENDPOINTS)) {
    tools.push({
      name: `query_${name.replace(/-/g, '_')}`,
      description: `Execute SPARQL query on ${name} knowledge graph. Domain: ${info.domain}. ${info.description}`,
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "SPARQL query to execute",
          },
        },
        required: ["query"],
      },
    });
  }

  return { tools };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    // List knowledge graphs
    if (name === "list_knowledge_graphs") {
      const kgList = Object.entries(FRINK_ENDPOINTS).map(([key, info]) => ({
        name: key,
        endpoint: info.url,
        domain: info.domain,
        description: info.description
      }));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(kgList, null, 2),
          },
        ],
      };
    }

    // Federated query
    if (name === "query_federated") {
      const data = await executeSparqlQuery(FEDERATED_ENDPOINT, args.query);
      const formattedResults = formatResults(data);
      
      return {
        content: [
          {
            type: "text",
            text: `# Federated Query Results\n\n${formattedResults}\n\n## Raw JSON:\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``,
          },
        ],
      };
    }

    // Individual KG queries
    const kgMatch = name.match(/^query_(.+)$/);
    if (kgMatch) {
      const kgName = kgMatch[1].replace(/_/g, '-');
      const endpoint = FRINK_ENDPOINTS[kgName];

      if (!endpoint) {
        throw new Error(`Unknown knowledge graph: ${kgName}`);
      }

      const data = await executeSparqlQuery(endpoint.url, args.query);
      const formattedResults = formatResults(data);

      return {
        content: [
          {
            type: "text",
            text: `# Query Results from ${kgName}\n\n${formattedResults}\n\n## Raw JSON:\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``,
          },
        ],
      };
    }

    throw new Error(`Unknown tool: ${name}`);

  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("OKN Unified MCP Server running on stdio");
  console.error(`Connected to ${Object.keys(FRINK_ENDPOINTS).length} knowledge graphs`);
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
