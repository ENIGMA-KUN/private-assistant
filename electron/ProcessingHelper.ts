// ProcessingHelper.ts
import fs from "node:fs"
import path from "node:path"
import { ScreenshotHelper } from "./ScreenshotHelper"
import { IProcessingHelperDeps } from "./main"
import * as axios from "axios"
import { app, BrowserWindow } from "electron"
import { configHelper } from "./ConfigHelper"
import { ModelAdapter, ModelMessage, MessageContent } from "./models/ModelInterface"
import { createModelAdapter } from "./models/ModelFactory"

export class ProcessingHelper {
  private deps: IProcessingHelperDeps
  private screenshotHelper: ScreenshotHelper
  private modelAdapter: ModelAdapter | null = null

  // AbortControllers for API requests
  private currentProcessingAbortController: AbortController | null = null
  private currentExtraProcessingAbortController: AbortController | null = null

  constructor(deps: IProcessingHelperDeps) {
    this.deps = deps
    this.screenshotHelper = deps.getScreenshotHelper()
    
    // Initialize model adapter
    this.initializeModelAdapter();
    
    // Listen for config changes to re-initialize the model adapter
    configHelper.on('config-updated', () => {
      this.initializeModelAdapter();
    });
  }
  
  /**
   * Initialize or reinitialize the model adapter with current config
   */
  private initializeModelAdapter(): void {
    try {
      const config = configHelper.loadConfig();
      const activeProvider = config.activeProvider;
      const providerConfig = config.providers[activeProvider];
      
      if (providerConfig && providerConfig.apiKey) {
        this.modelAdapter = createModelAdapter({
          provider: activeProvider,
          apiKey: providerConfig.apiKey,
          model: providerConfig.model
        });
        console.log(`Model adapter initialized for ${activeProvider}`);
      } else {
        this.modelAdapter = null;
        console.warn(`No API key available for ${activeProvider}, model adapter not initialized`);
      }
    } catch (error) {
      console.error("Failed to initialize model adapter:", error);
      this.modelAdapter = null;
    }
  }

  private async waitForInitialization(
    mainWindow: BrowserWindow
  ): Promise<void> {
    let attempts = 0
    const maxAttempts = 50 // 5 seconds total

    while (attempts < maxAttempts) {
      const isInitialized = await mainWindow.webContents.executeJavaScript(
        "window.__IS_INITIALIZED__"
      )
      if (isInitialized) return
      await new Promise((resolve) => setTimeout(resolve, 100))
      attempts++
    }
    throw new Error("App failed to initialize after 5 seconds")
  }

  private async getCredits(): Promise<number> {
    const mainWindow = this.deps.getMainWindow()
    if (!mainWindow) return 999 // Unlimited credits in this version

    try {
      await this.waitForInitialization(mainWindow)
      return 999 // Always return sufficient credits to work
    } catch (error) {
      console.error("Error getting credits:", error)
      return 999 // Unlimited credits as fallback
    }
  }

  private async getLanguage(): Promise<string> {
    try {
      // Get language from config
      const config = configHelper.loadConfig();
      if (config.language) {
        return config.language;
      }
      
      // Fallback to window variable if config doesn't have language
      const mainWindow = this.deps.getMainWindow()
      if (mainWindow) {
        try {
          await this.waitForInitialization(mainWindow)
          const language = await mainWindow.webContents.executeJavaScript(
            "window.__LANGUAGE__"
          )

          if (
            typeof language === "string" &&
            language !== undefined &&
            language !== null
          ) {
            return language;
          }
        } catch (err) {
          console.warn("Could not get language from window", err);
        }
      }
      
      // Default fallback
      return "python";
    } catch (error) {
      console.error("Error getting language:", error)
      return "python"
    }
  }

  private async getInterviewMode(): Promise<string> {
    // Get interview mode from config
    return configHelper.getInterviewMode() || "coding";
  }

  public async processScreenshots(): Promise<void> {
    const mainWindow = this.deps.getMainWindow()
    if (!mainWindow) return

    // First verify we have a valid model adapter
    if (!this.modelAdapter) {
      this.initializeModelAdapter();
      
      if (!this.modelAdapter) {
        console.error("Model adapter not initialized");
        mainWindow.webContents.send(
          this.deps.PROCESSING_EVENTS.API_KEY_INVALID
        );
        return;
      }
    }

    const view = this.deps.getView()
    console.log("Processing screenshots in view:", view)

    if (view === "queue") {
      mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.INITIAL_START)
      const screenshotQueue = this.screenshotHelper.getScreenshotQueue()
      console.log("Processing main queue screenshots:", screenshotQueue)
      if (screenshotQueue.length === 0) {
        mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.NO_SCREENSHOTS)
        return
      }

      try {
        // Initialize AbortController
        this.currentProcessingAbortController = new AbortController()
        const { signal } = this.currentProcessingAbortController

        const screenshots = await Promise.all(
          screenshotQueue.map(async (path) => ({
            path,
            preview: await this.screenshotHelper.getImagePreview(path),
            data: fs.readFileSync(path).toString('base64')
          }))
        )

        const result = await this.processScreenshotsHelper(screenshots, signal)

        if (!result.success) {
          console.log("Processing failed:", result.error)
          if (result.error?.includes("API Key") || result.error?.includes("API key")) {
            mainWindow.webContents.send(
              this.deps.PROCESSING_EVENTS.API_KEY_INVALID
            )
          } else {
            mainWindow.webContents.send(
              this.deps.PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR,
              result.error
            )
          }
          // Reset view back to queue on error
          console.log("Resetting view to queue due to error")
          this.deps.setView("queue")
          return
        }

        // Only set view to solutions if processing succeeded
        console.log("Setting view to solutions after successful processing")
        mainWindow.webContents.send(
          this.deps.PROCESSING_EVENTS.SOLUTION_SUCCESS,
          result.data
        )
        this.deps.setView("solutions")
      } catch (error: any) {
        mainWindow.webContents.send(
          this.deps.PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR,
          error
        )
        console.error("Processing error:", error)
        if (axios.isCancel(error)) {
          mainWindow.webContents.send(
            this.deps.PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR,
            "Processing was canceled by the user."
          )
        } else {
          mainWindow.webContents.send(
            this.deps.PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR,
            error.message || "Server error. Please try again."
          )
        }
        // Reset view back to queue on error
        console.log("Resetting view to queue due to error")
        this.deps.setView("queue")
      } finally {
        this.currentProcessingAbortController = null
      }
    } else {
      // view == 'solutions'
      const extraScreenshotQueue =
        this.screenshotHelper.getExtraScreenshotQueue()
      console.log("Processing extra queue screenshots:", extraScreenshotQueue)
      if (extraScreenshotQueue.length === 0) {
        mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.NO_SCREENSHOTS)
        return
      }
      mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.DEBUG_START)

      // Initialize AbortController
      this.currentExtraProcessingAbortController = new AbortController()
      const { signal } = this.currentExtraProcessingAbortController

      try {
        const screenshots = await Promise.all(
          [
            ...this.screenshotHelper.getScreenshotQueue(),
            ...extraScreenshotQueue
          ].map(async (path) => ({
            path,
            preview: await this.screenshotHelper.getImagePreview(path),
            data: fs.readFileSync(path).toString('base64')
          }))
        )
        console.log(
          "Combined screenshots for processing:",
          screenshots.map((s) => s.path)
        )

        const result = await this.processExtraScreenshotsHelper(
          screenshots,
          signal
        )

        if (result.success) {
          this.deps.setHasDebugged(true)
          mainWindow.webContents.send(
            this.deps.PROCESSING_EVENTS.DEBUG_SUCCESS,
            result.data
          )
        } else {
          mainWindow.webContents.send(
            this.deps.PROCESSING_EVENTS.DEBUG_ERROR,
            result.error
          )
        }
      } catch (error: any) {
        if (axios.isCancel(error)) {
          mainWindow.webContents.send(
            this.deps.PROCESSING_EVENTS.DEBUG_ERROR,
            "Extra processing was canceled by the user."
          )
        } else {
          mainWindow.webContents.send(
            this.deps.PROCESSING_EVENTS.DEBUG_ERROR,
            error.message
          )
        }
      } finally {
        this.currentExtraProcessingAbortController = null
      }
    }
  }

  private async processScreenshotsHelper(
    screenshots: Array<{ path: string; data: string }>,
    signal: AbortSignal
  ) {
    try {
      const language = await this.getLanguage();
      const interviewMode = await this.getInterviewMode();
      const mainWindow = this.deps.getMainWindow();
      
      // Verify model adapter
      if (!this.modelAdapter) {
        this.initializeModelAdapter(); // Try to reinitialize
        
        if (!this.modelAdapter) {
          return {
            success: false,
            error: "API key not configured or invalid. Please check your settings."
          };
        }
      }

      // Step 1: Extract problem info using vision API
      const imageDataList = screenshots.map(screenshot => screenshot.data);
      
      // Update the user on progress
      if (mainWindow) {
        mainWindow.webContents.send("processing-status", {
          message: "Analyzing problem from screenshots...",
          progress: 20
        });
      }
      
      // Create system prompt based on interview mode
      const systemPrompt = this.createSystemPromptByMode(interviewMode);
      
      // Create messages for the API
      const messages: ModelMessage[] = [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Extract the problem details from these screenshots. Return in JSON format. Preferred coding language is ${language}.`
            },
            ...imageDataList.map(data => ({
              type: "image_url" as const,
              image_url: { url: `data:image/png;base64,${data}` }
            }))
          ]
        }
      ];

      // Send to vision API
      const extractionResponse = await this.modelAdapter.vision(messages, {
        maxTokens: 4000,
        temperature: 0.2,
        signal
      });

      // Parse the response to get structured problem info
      let problemInfo;
      try {
        const responseText = extractionResponse.content;
        // Handle when model might wrap the JSON in markdown code blocks
        const jsonText = responseText.replace(/```json|```/g, '').trim();
        problemInfo = JSON.parse(jsonText);
        
        // Update the user on progress
        if (mainWindow) {
          mainWindow.webContents.send("processing-status", {
            message: "Problem analyzed successfully. Preparing to generate solution...",
            progress: 40
          });
        }
      } catch (error) {
        console.error("Error parsing problem extraction response:", error);
        console.log("Raw response:", extractionResponse.content);
        return {
          success: false,
          error: "Failed to parse problem information. Please try again or use clearer screenshots."
        };
      }

      // Store problem info in AppState
      this.deps.setProblemInfo(problemInfo);

      // Send first success event
      if (mainWindow) {
        mainWindow.webContents.send(
          this.deps.PROCESSING_EVENTS.PROBLEM_EXTRACTED,
          problemInfo
        );

        // Generate solutions after successful extraction
        const solutionsResult = await this.generateSolutionsHelper(signal, interviewMode);
        if (solutionsResult.success) {
          // Clear any existing extra screenshots before transitioning to solutions view
          this.screenshotHelper.clearExtraScreenshotQueue();
          
          // Final progress update
          mainWindow.webContents.send("processing-status", {
            message: "Solution generated successfully",
            progress: 100
          });
          
          mainWindow.webContents.send(
            this.deps.PROCESSING_EVENTS.SOLUTION_SUCCESS,
            solutionsResult.data
          );
          return { success: true, data: solutionsResult.data };
        } else {
          throw new Error(
            solutionsResult.error || "Failed to generate solutions"
          );
        }
      }

      return { success: false, error: "Failed to process screenshots" };
    } catch (error: any) {
      // If the request was cancelled, don't retry
      if (axios.isCancel(error)) {
        return {
          success: false,
          error: "Processing was canceled by the user."
        };
      }
      
      // Handle API errors
      if (error?.response?.status === 401) {
        return {
          success: false,
          error: "Invalid API key. Please check your settings."
        };
      } else if (error?.response?.status === 429) {
        return {
          success: false,
          error: "API rate limit exceeded or insufficient credits. Please try again later."
        };
      } else if (error?.response?.status === 500) {
        return {
          success: false,
          error: "Server error. Please try again later."
        };
      }

      console.error("API Error Details:", error);
      return { 
        success: false, 
        error: error.message || "Failed to process screenshots. Please try again." 
      };
    }
  }

  private createSystemPromptByMode(mode: string): string {
    switch(mode) {
      case "coding":
        return "You are a coding challenge interpreter. Analyze the screenshot of the coding problem and extract all relevant information. Return the information in JSON format with these fields: problem_statement, constraints, example_input, example_output. Just return the structured JSON without any other text.";
      
      case "system_design":
        return "You are a system design interview assistant. Analyze the screenshot of the system design problem and extract all relevant information. Return the information in JSON format with these fields: problem_statement, requirements, constraints, scale, additional_context. Just return the structured JSON without any other text.";
      
      case "react":
        return "You are a React coding interview assistant. Analyze the screenshot of the React frontend problem and extract all relevant information. Return the information in JSON format with these fields: problem_statement, ui_requirements, functionality, constraints, sample_data. Just return the structured JSON without any other text.";
      
      case "sql":
        return "You are a SQL interview assistant. Analyze the screenshot of the SQL problem and extract all relevant information. Return the information in JSON format with these fields: problem_statement, table_schemas, sample_data, expected_output, constraints. Just return the structured JSON without any other text.";
      
      case "linux":
        return "You are a Linux/kernel interview assistant. Analyze the screenshot of the Linux/kernel problem and extract all relevant information. Return the information in JSON format with these fields: problem_statement, environment, command_requirements, expected_behavior, constraints. Just return the structured JSON without any other text.";
      
      case "certification":
        return "You are a certification exam assistant. Analyze the screenshot of the exam question and extract all relevant information. First determine the question type (multiple_choice, fill_in_blank, matching, arrange, other). Return the information in JSON format with these fields: question_type, question_text, options (if applicable), context. Just return the structured JSON without any other text.";
      
      default:
        return "You are a coding challenge interpreter. Analyze the screenshot of the coding problem and extract all relevant information. Return the information in JSON format with these fields: problem_statement, constraints, example_input, example_output. Just return the structured JSON without any other text.";
    }
  }

  private async generateSolutionsHelper(signal: AbortSignal, mode: string = "coding") {
    try {
      const problemInfo = this.deps.getProblemInfo();
      const language = await this.getLanguage();
      const mainWindow = this.deps.getMainWindow();

      if (!problemInfo) {
        throw new Error("No problem info available");
      }

      if (!this.modelAdapter) {
        return {
          success: false,
          error: "API key not configured. Please check your settings."
        };
      }

      // Update progress status
      if (mainWindow) {
        mainWindow.webContents.send("processing-status", {
          message: "Creating optimal solution with detailed explanations...",
          progress: 60
        });
      }

      // Create prompt based on mode
      const promptText = this.createSolutionPromptByMode(mode, problemInfo, language);

      // Send to model
      const solutionResponse = await this.modelAdapter.complete(
        [
          { 
            role: "system", 
            content: "You are an expert coding interview assistant. Provide clear, optimal solutions with detailed explanations." 
          },
          { 
            role: "user", 
            content: promptText 
          }
        ],
        {
          maxTokens: 4000,
          temperature: 0.2,
          signal
        }
      );

      const responseContent = solutionResponse.content;
      
      // Process the response based on the interview mode
      return this.processSolutionResponse(responseContent, mode);
    } catch (error: any) {
      // Handle API errors
      if (error?.response?.status === 401) {
        return {
          success: false,
          error: "Invalid API key. Please check your settings."
        };
      } else if (error?.response?.status === 429) {
        return {
          success: false,
          error: "API rate limit exceeded or insufficient credits. Please try again later."
        };
      }
      
      console.error("Solution generation error:", error);
      return { success: false, error: error.message || "Failed to generate solution" };
    }
  }

  private createSolutionPromptByMode(mode: string, problemInfo: any, language: string): string {
    switch(mode) {
      case "coding":
        return `
Generate a detailed solution for the following coding problem:

PROBLEM STATEMENT:
${problemInfo.problem_statement}

CONSTRAINTS:
${problemInfo.constraints || "No specific constraints provided."}

EXAMPLE INPUT:
${problemInfo.example_input || "No example input provided."}

EXAMPLE OUTPUT:
${problemInfo.example_output || "No example output provided."}

LANGUAGE: ${language}

I need the response in the following format:
1. Code: A clean, optimized implementation in ${language}
2. Your Thoughts: A list of key insights and reasoning behind your approach
3. Time complexity: O(X) with a detailed explanation (at least 2 sentences)
4. Space complexity: O(X) with a detailed explanation (at least 2 sentences)

For complexity explanations, please be thorough. For example: "Time complexity: O(n) because we iterate through the array only once. This is optimal as we need to examine each element at least once to find the solution." or "Space complexity: O(n) because in the worst case, we store all elements in the hashmap. The additional space scales linearly with the input size."

Your solution should be efficient, well-commented, and handle edge cases.
`;

      case "system_design":
        return `
Generate a detailed solution for the following system design problem:

PROBLEM STATEMENT:
${problemInfo.problem_statement}

REQUIREMENTS:
${problemInfo.requirements || "No specific requirements provided."}

CONSTRAINTS:
${problemInfo.constraints || "No specific constraints provided."}

SCALE:
${problemInfo.scale || "No specific scale information provided."}

ADDITIONAL CONTEXT:
${problemInfo.additional_context || "No additional context provided."}

I need the response in the following format:
1. System Architecture: High-level architecture with key components
2. Key Components: List each major component and its responsibility
3. Data Model: Describe the data schemas and storage choices
4. Scalability Considerations: How this design scales to handle growth
5. Tradeoffs: List of the key tradeoffs in your design

Your solution should be clear, efficient, and address all the requirements and constraints.
`;

      case "react":
        return `
Generate a detailed solution for the following React frontend coding problem:

PROBLEM STATEMENT:
${problemInfo.problem_statement}

UI REQUIREMENTS:
${problemInfo.ui_requirements || "No specific UI requirements provided."}

FUNCTIONALITY:
${problemInfo.functionality || "No specific functionality details provided."}

CONSTRAINTS:
${problemInfo.constraints || "No specific constraints provided."}

SAMPLE DATA:
${problemInfo.sample_data || "No sample data provided."}

I need the response in the following format:
1. Code: A clean, optimized React implementation
2. Component Structure: Description of the component hierarchy
3. State Management: How state is handled in the solution
4. Key Features: Highlight of important implementation details
5. Potential Improvements: How the solution could be extended

Your solution should use modern React practices, be performant, and meet all requirements.
`;

      case "sql":
        return `
Generate a detailed solution for the following SQL problem:

PROBLEM STATEMENT:
${problemInfo.problem_statement}

TABLE SCHEMAS:
${problemInfo.table_schemas || "No specific table schemas provided."}

SAMPLE DATA:
${problemInfo.sample_data || "No sample data provided."}

EXPECTED OUTPUT:
${problemInfo.expected_output || "No specific expected output provided."}

CONSTRAINTS:
${problemInfo.constraints || "No specific constraints provided."}

I need the response in the following format:
1. SQL Query: A clean, optimized SQL solution
2. Explanation: Step-by-step explanation of how the query works
3. Performance Considerations: Any indexes or optimizations to consider
4. Alternative Approaches: Other ways to solve this problem

Your solution should be efficient, follow best practices, and produce the expected output.
`;

      case "linux":
        return `
Generate a detailed solution for the following Linux/kernel problem:

PROBLEM STATEMENT:
${problemInfo.problem_statement}

ENVIRONMENT:
${problemInfo.environment || "No specific environment details provided."}

COMMAND REQUIREMENTS:
${problemInfo.command_requirements || "No specific command requirements provided."}

EXPECTED BEHAVIOR:
${problemInfo.expected_behavior || "No specific expected behavior provided."}

CONSTRAINTS:
${problemInfo.constraints || "No specific constraints provided."}

I need the response in the following format:
1. Solution Commands: The exact commands to solve the problem
2. Explanation: Step-by-step explanation of what each command does
3. Verification: How to verify the solution works correctly
4. Alternative Approaches: Other ways to solve this problem

Your solution should be efficient, follow best practices, and meet all requirements.
`;

      case "certification":
        return `
Generate a detailed solution for the following certification exam question:

QUESTION TYPE:
${problemInfo.question_type || "Unknown"}

QUESTION TEXT:
${problemInfo.question_text}

OPTIONS:
${problemInfo.options || "No options provided."}

CONTEXT:
${problemInfo.context || "No specific context provided."}

I need both the answer and a detailed explanation:
1. Answer: Clear, direct answer to the question
2. Explanation: Detailed explanation of why this is the correct answer
3. Additional Context: Any important information that helps understand the topic

Your solution should be accurate and comprehensive.
`;

      default:
        return `
Generate a detailed solution for the following problem:

PROBLEM STATEMENT:
${problemInfo.problem_statement}

I need a comprehensive solution with clear explanations.
`;
    }
  }

  private processSolutionResponse(responseContent: string, mode: string) {
    switch(mode) {
      case "coding":
        return this.processCodingSolution(responseContent);
      case "system_design":
        return this.processSystemDesignSolution(responseContent);
      case "react":
        return this.processReactSolution(responseContent);
      case "sql":
        return this.processSQLSolution(responseContent);
      case "linux":
        return this.processLinuxSolution(responseContent);
      case "certification":
        return this.processCertificationSolution(responseContent);
      default:
        return this.processCodingSolution(responseContent);
    }
  }

  private processCodingSolution(responseContent: string) {
    // Extract parts from the response
    const codeMatch = responseContent.match(/```(?:\w+)?\s*([\s\S]*?)```/);
    const code = codeMatch ? codeMatch[1].trim() : responseContent;
    
    // Extract thoughts, looking for bullet points or numbered lists
    const thoughtsRegex = /(?:Thoughts:|Key Insights:|Reasoning:|Approach:)([\s\S]*?)(?:Time complexity:|$)/i;
    const thoughtsMatch = responseContent.match(thoughtsRegex);
    let thoughts: string[] = [];
    
    if (thoughtsMatch && thoughtsMatch[1]) {
      // Extract bullet points or numbered items
      const bulletPoints = thoughtsMatch[1].match(/(?:^|\n)\s*(?:[-*•]|\d+\.)\s*(.*)/g);
      if (bulletPoints) {
        thoughts = bulletPoints.map(point => 
          point.replace(/^\s*(?:[-*•]|\d+\.)\s*/, '').trim()
        ).filter(Boolean);
      } else {
        // If no bullet points found, split by newlines and filter empty lines
        thoughts = thoughtsMatch[1].split('\n')
          .map(line => line.trim())
          .filter(Boolean);
      }
    }
    
    // Extract complexity information
    // Use more flexible patterns to find complexity sections
    const timeComplexityPattern = /Time complexity:?\s*([^\n]+(?:\n[^\n]+)*?)(?=\n\s*(?:Space complexity|$))/i;
    const spaceComplexityPattern = /Space complexity:?\s*([^\n]+(?:\n[^\n]+)*?)(?=\n\s*(?:[A-Z]|$))/i;
    
    let timeComplexity = "O(n) - Linear time complexity because we only iterate through the array once. Each element is processed exactly one time, and the hashmap lookups are O(1) operations.";
    let spaceComplexity = "O(n) - Linear space complexity because we store elements in the hashmap. In the worst case, we might need to store all elements before finding the solution pair.";
    
    // Extract time complexity with better matching
    const timeMatch = responseContent.match(timeComplexityPattern);
    if (timeMatch && timeMatch[1]) {
      timeComplexity = timeMatch[1].trim();
      // Ensure the response includes actual Big O notation and a dash
      if (!timeComplexity.match(/O\([^)]+\)/i)) {
        timeComplexity = `O(n) - ${timeComplexity}`;
      } else if (!timeComplexity.includes('-') && !timeComplexity.includes('because')) {
        // Add a dash if there isn't one and no 'because'
        const notationMatch = timeComplexity.match(/O\([^)]+\)/i);
        if (notationMatch) {
          const notation = notationMatch[0];
          const rest = timeComplexity.replace(notation, '').trim();
          timeComplexity = `${notation} - ${rest}`;
        }
      }
    }
    
    // Extract space complexity with better matching
    const spaceMatch = responseContent.match(spaceComplexityPattern);
    if (spaceMatch && spaceMatch[1]) {
      spaceComplexity = spaceMatch[1].trim();
      // Ensure the response includes actual Big O notation and a dash
      if (!spaceComplexity.match(/O\([^)]+\)/i)) {
        spaceComplexity = `O(n) - ${spaceComplexity}`;
      } else if (!spaceComplexity.includes('-') && !spaceComplexity.includes('because')) {
        // Add a dash if there isn't one and no 'because'
        const notationMatch = spaceComplexity.match(/O\([^)]+\)/i);
        if (notationMatch) {
          const notation = notationMatch[0];
          const rest = spaceComplexity.replace(notation, '').trim();
          spaceComplexity = `${notation} - ${rest}`;
        }
      }
    }

    // Construct the formatted response
    const formattedResponse = {
      code: code,
      thoughts: thoughts.length > 0 ? thoughts : ["Solution approach based on efficiency and readability"],
      time_complexity: timeComplexity,
      space_complexity: spaceComplexity
    };

    return { success: true, data: formattedResponse };
  }

  private processSystemDesignSolution(responseContent: string) {
    // Extract the architecture section
    const architectureMatch = responseContent.match(/(?:System Architecture|Architecture|High-level design):([\s\S]*?)(?:(?:Key|Major) Components:|$)/i);
    const architecture = architectureMatch ? architectureMatch[1].trim() : "";
    
    // Extract components
    const componentsMatch = responseContent.match(/(?:Key|Major) Components:([\s\S]*?)(?:Data Model:|$)/i);
    let components: string[] = [];
    
    if (componentsMatch && componentsMatch[1]) {
      // Extract bullet points
      const bulletPoints = componentsMatch[1].match(/(?:^|\n)\s*(?:[-*•]|\d+\.)\s*(.*)/g);
      if (bulletPoints) {
        components = bulletPoints.map(point => 
          point.replace(/^\s*(?:[-*•]|\d+\.)\s*/, '').trim()
        ).filter(Boolean);
      } else {
        components = componentsMatch[1].split('\n')
          .map(line => line.trim())
          .filter(Boolean);
      }
    }
    
    // Extract data model
    const dataModelMatch = responseContent.match(/Data Model:([\s\S]*?)(?:Scalability|$)/i);
    const dataModel = dataModelMatch ? dataModelMatch[1].trim() : "";
    
    // Extract scalability
    const scalabilityMatch = responseContent.match(/Scalability[^:]*:([\s\S]*?)(?:Tradeoffs|$)/i);
    const scalability = scalabilityMatch ? scalabilityMatch[1].trim() : "";
    
    // Extract tradeoffs
    const tradeoffsMatch = responseContent.match(/Tradeoffs[^:]*:([\s\S]*?)$/i);
    const tradeoffs = tradeoffsMatch ? tradeoffsMatch[1].trim() : "";
    
    // Construct the formatted response
    const formattedResponse = {
      code: "", // Empty for system design
      diagram: architecture, // Use architecture as diagram
      thoughts: components.length > 0 ? components : ["System design approach based on requirements"],
      time_complexity: "N/A for system design",
      space_complexity: "N/A for system design",
      // Additional system design specific fields
      architecture: architecture,
      data_model: dataModel,
      scalability: scalability,
      tradeoffs: tradeoffs
    };

    return { success: true, data: formattedResponse };
  }

  private processReactSolution(responseContent: string) {
    // Extract code with React components
    const codeMatch = responseContent.match(/```(?:jsx|tsx|javascript|js|react)?\s*([\s\S]*?)```/);
    const code = codeMatch ? codeMatch[1].trim() : "";
    
    // Extract component structure
    const structureMatch = responseContent.match(/Component Structure:([\s\S]*?)(?:State Management:|$)/i);
    let structure: string[] = [];
    
    if (structureMatch && structureMatch[1]) {
      const bulletPoints = structureMatch[1].match(/(?:^|\n)\s*(?:[-*•]|\d+\.)\s*(.*)/g);
      if (bulletPoints) {
        structure = bulletPoints.map(point => 
          point.replace(/^\s*(?:[-*•]|\d+\.)\s*/, '').trim()
        ).filter(Boolean);
      } else {
        structure = structureMatch[1].split('\n')
          .map(line => line.trim())
          .filter(Boolean);
      }
    }
    
    // Extract state management
    const stateMatch = responseContent.match(/State Management:([\s\S]*?)(?:Key Features:|$)/i);
    const stateManagement = stateMatch ? stateMatch[1].trim() : "";
    
    // Extract key features
    const featuresMatch = responseContent.match(/Key Features:([\s\S]*?)(?:Potential Improvements:|$)/i);
    let features: string[] = [];
    
    if (featuresMatch && featuresMatch[1]) {
      const bulletPoints = featuresMatch[1].match(/(?:^|\n)\s*(?:[-*•]|\d+\.)\s*(.*)/g);
      if (bulletPoints) {
        features = bulletPoints.map(point => 
          point.replace(/^\s*(?:[-*•]|\d+\.)\s*/, '').trim()
        ).filter(Boolean);
      } else {
        features = featuresMatch[1].split('\n')
          .map(line => line.trim())
          .filter(Boolean);
      }
    }
    
    // Construct the formatted response
    const formattedResponse = {
      code: code,
      thoughts: structure.length > 0 ? structure : features.length > 0 ? features : ["React component design based on requirements"],
      time_complexity: "N/A for React components",
      space_complexity: "N/A for React components",
      // Additional React specific fields
      component_structure: structure.join("\n"),
      state_management: stateManagement
    };

    return { success: true, data: formattedResponse };
  }

  private processSQLSolution(responseContent: string) {
    // Extract SQL query
    const sqlMatch = responseContent.match(/```(?:sql)?\s*([\s\S]*?)```/);
    const sql = sqlMatch ? sqlMatch[1].trim() : "";
    
    // Extract explanation
    const explanationMatch = responseContent.match(/Explanation:([\s\S]*?)(?:Performance|$)/i);
    let explanation: string[] = [];
    
    if (explanationMatch && explanationMatch[1]) {
      const paragraphs = explanationMatch[1].split('\n\n').filter(Boolean);
      explanation = paragraphs.map(p => p.trim());
    }
    
    // Extract performance considerations
    const performanceMatch = responseContent.match(/Performance[^:]*:([\s\S]*?)(?:Alternative|$)/i);
    const performance = performanceMatch ? performanceMatch[1].trim() : "";
    
    // Extract alternative approaches
    const alternativesMatch = responseContent.match(/Alternative[^:]*:([\s\S]*?)$/i);
    const alternatives = alternativesMatch ? alternativesMatch[1].trim() : "";
    
    // Construct the formatted response
    const formattedResponse = {
      code: sql,
      thoughts: explanation.length > 0 ? explanation : ["SQL query design based on requirements"],
      time_complexity: performance || "Depends on database indexes and query execution plan",
      space_complexity: "Depends on result set size and temporary tables used",
      // Additional SQL specific fields
      alternatives: alternatives
    };

    return { success: true, data: formattedResponse };
  }

  private processLinuxSolution(responseContent: string) {
    // Extract solution commands
    const commandsMatch = responseContent.match(/(?:Solution Commands|Commands|Command):([\s\S]*?)(?:Explanation:|$)/i);
    const commands = commandsMatch ? commandsMatch[1].trim() : "";
    
    // Extract explanation
    const explanationMatch = responseContent.match(/Explanation:([\s\S]*?)(?:Verification:|$)/i);
    let explanation: string[] = [];
    
    if (explanationMatch && explanationMatch[1]) {
      const steps = explanationMatch[1].match(/(?:^|\n)\s*(?:[-*•]|\d+\.)\s*(.*)/g);
      if (steps) {
        explanation = steps.map(step => 
          step.replace(/^\s*(?:[-*•]|\d+\.)\s*/, '').trim()
        ).filter(Boolean);
      } else {
        explanation = explanationMatch[1].split('\n')
          .map(line => line.trim())
          .filter(Boolean);
      }
    }
    
    // Extract verification
    const verificationMatch = responseContent.match(/Verification:([\s\S]*?)(?:Alternative|$)/i);
    const verification = verificationMatch ? verificationMatch[1].trim() : "";
    
    // Extract alternatives
    const alternativesMatch = responseContent.match(/Alternative[^:]*:([\s\S]*?)$/i);
    const alternatives = alternativesMatch ? alternativesMatch[1].trim() : "";
    
    // Construct the formatted response
    const formattedResponse = {
      code: commands,
      thoughts: explanation.length > 0 ? explanation : ["Linux commands based on requirements"],
      time_complexity: "N/A for Linux commands",
      space_complexity: "N/A for Linux commands",
      // Additional Linux specific fields
      verification: verification,
      alternatives: alternatives
    };

    return { success: true, data: formattedResponse };
  }

  private processCertificationSolution(responseContent: string) {
    // Extract answer
    const answerMatch = responseContent.match(/(?:Answer|Correct Answer|Solution):([\s\S]*?)(?:Explanation:|$)/i);
    const answer = answerMatch ? answerMatch[1].trim() : "";
    
    // Extract explanation
    const explanationMatch = responseContent.match(/Explanation:([\s\S]*?)(?:Additional Context:|$)/i);
    let explanation: string[] = [];
    
    if (explanationMatch && explanationMatch[1]) {
      const paragraphs = explanationMatch[1].split('\n\n').filter(Boolean);
      explanation = paragraphs.map(p => p.trim());
    }
    
    // Extract additional context
    const contextMatch = responseContent.match(/Additional Context:([\s\S]*?)$/i);
    const additionalContext = contextMatch ? contextMatch[1].trim() : "";
    
    // Construct the formatted response
    const formattedResponse = {
      code: answer, // Put answer in the code field for display
      thoughts: explanation.length > 0 ? explanation : ["Certification answer based on knowledge"],
      time_complexity: "N/A for certification exam",
      space_complexity: "N/A for certification exam",
      // Additional certification specific fields
      answer: answer,
      additional_context: additionalContext
    };

    return { success: true, data: formattedResponse };
  }

  private async processExtraScreenshotsHelper(
    screenshots: Array<{ path: string; data: string }>,
    signal: AbortSignal
  ) {
    try {
      const problemInfo = this.deps.getProblemInfo();
      const language = await this.getLanguage();
      const interviewMode = await this.getInterviewMode();
      const mainWindow = this.deps.getMainWindow();

      if (!problemInfo) {
        throw new Error("No problem info available");
      }

      if (!this.modelAdapter) {
        return {
          success: false,
          error: "API key not configured. Please check your settings."
        };
      }
      
      // Update progress status
      if (mainWindow) {
        mainWindow.webContents.send("processing-status", {
          message: "Processing debug screenshots...",
          progress: 30
        });
      }

      // Prepare the images for the API call
      const imageDataList = screenshots.map(screenshot => screenshot.data);
      
      // Create appropriate debugging prompt based on interview mode
      const systemPrompt = this.createDebugSystemPromptByMode(interviewMode);
      
      // Create user prompt with problem context
      const userPrompt = this.createDebugUserPromptByMode(
        interviewMode, 
        problemInfo,
        language
      );
      
      const messages: ModelMessage[] = [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: userPrompt
            },
            ...imageDataList.map(data => ({
              type: "image_url" as const,
              image_url: { url: `data:image/png;base64,${data}` }
            }))
          ]
        }
      ];

      // Update progress
      if (mainWindow) {
        mainWindow.webContents.send("processing-status", {
          message: "Analyzing code and generating debug feedback...",
          progress: 60
        });
      }

      // Send to vision API
      const debugResponse = await this.modelAdapter.vision(messages, {
        maxTokens: 4000,
        temperature: 0.2,
        signal
      });
      
      // Update final progress
      if (mainWindow) {
        mainWindow.webContents.send("processing-status", {
          message: "Debug analysis complete",
          progress: 100
        });
      }

      // Extract and format the debug response
      const debugContent = debugResponse.content;
      
      // Extract code if there's code block in the response
      let extractedCode = "// Debug mode - see analysis below";
      const codeMatch = debugContent.match(/```(?:[a-zA-Z]+)?([\s\S]*?)```/);
      if (codeMatch && codeMatch[1]) {
        extractedCode = codeMatch[1].trim();
      }

      // Try to extract bullet points for "thoughts"
      const bulletPoints = debugContent.match(/(?:^|\n)[ ]*(?:[-*•]|\d+\.)[ ]+([^\n]+)/g);
      const thoughts = bulletPoints 
        ? bulletPoints.map(point => point.replace(/^[ ]*(?:[-*•]|\d+\.)[ ]+/, '').trim()).slice(0, 5)
        : ["Debug analysis based on your screenshots"];
      
      // Return the debug assistance in the format expected by the app
      const response = {
        code: extractedCode,
        debug_analysis: debugContent,
        thoughts: thoughts,
        time_complexity: "N/A - Debug mode",
        space_complexity: "N/A - Debug mode"
      };

      return { success: true, data: response };
    } catch (error: any) {
      // Handle API errors specifically
      if (error?.response?.status === 401) {
        return {
          success: false,
          error: "Invalid API key. Please check your settings."
        };
      } else if (error?.response?.status === 429) {
        return {
          success: false,
          error: "API rate limit exceeded or insufficient credits. Please try again later."
        };
      }
      
      console.error("Debug processing error:", error);
      return { success: false, error: error.message || "Failed to process debug request" };
    }
  }

  private createDebugSystemPromptByMode(mode: string): string {
    switch(mode) {
      case "coding":
        return `You are a coding interview assistant helping debug and improve solutions. Analyze these screenshots which include either error messages, incorrect outputs, or test cases, and provide detailed debugging help.

Your response MUST follow this exact structure with these section headers (use ### for headers):
### Issues Identified
- List each issue as a bullet point with clear explanation

### Specific Improvements and Corrections
- List specific code changes needed as bullet points

### Optimizations
- List any performance optimizations if applicable

### Explanation of Changes Needed
Here provide a clear explanation of why the changes are needed

### Key Points
- Summary bullet points of the most important takeaways

If you include code examples, use proper markdown code blocks with language specification (e.g. \`\`\`java).`;
      
      case "system_design":
        return `You are a system design interview assistant helping improve design solutions. Analyze these screenshots which include either system design diagrams, potential issues, or requirements, and provide detailed improvement suggestions.

Your response MUST follow this exact structure with these section headers (use ### for headers):
### Design Issues Identified
- List each issue as a bullet point with clear explanation

### Architecture Improvements
- List specific architecture changes needed as bullet points

### Scalability Enhancements
- Suggest ways to improve scalability

### Data Flow Optimizations
- Suggest improvements to data flow and processing

### Key Points
- Summary bullet points of the most important takeaways`;
      
      case "react":
        return `You are a React interview assistant helping debug and improve frontend solutions. Analyze these screenshots which include React code, UI issues, or requirements, and provide detailed debugging help.

Your response MUST follow this exact structure with these section headers (use ### for headers):
### UI/UX Issues Identified
- List each issue as a bullet point with clear explanation

### Component Structure Improvements
- Suggest better component organization if applicable

### State Management Optimizations
- Suggest improvements to how state is managed

### Performance Enhancements
- List ways to improve React performance

### Key Points
- Summary bullet points of the most important takeaways

If you include code examples, use proper markdown code blocks with language specification (e.g. \`\`\`jsx).`;
      
      case "sql":
        return `You are a SQL interview assistant helping debug and improve database queries. Analyze these screenshots which include SQL queries, error messages, or requirements, and provide detailed debugging help.

Your response MUST follow this exact structure with these section headers (use ### for headers):
### Query Issues Identified
- List each issue as a bullet point with clear explanation

### Query Improvements
- List specific SQL changes needed as bullet points

### Performance Optimizations
- Suggest indexes or query rewrites for better performance

### Alternative Approaches
- Suggest alternative query strategies if applicable

### Key Points
- Summary bullet points of the most important takeaways

If you include code examples, use proper markdown code blocks with language specification (e.g. \`\`\`sql).`;
      
      case "linux":
        return `You are a Linux/kernel interview assistant helping debug and improve command-line solutions. Analyze these screenshots which include commands, error messages, or requirements, and provide detailed debugging help.

Your response MUST follow this exact structure with these section headers (use ### for headers):
### Command Issues Identified
- List each issue as a bullet point with clear explanation

### Command Improvements
- List specific command changes needed as bullet points

### Alternative Commands
- Suggest alternative commands that might work better

### Verification Steps
- Suggest how to verify the solution works correctly

### Key Points
- Summary bullet points of the most important takeaways

If you include code examples, use proper markdown code blocks with language specification (e.g. \`\`\`bash).`;
      
      case "certification":
        return `You are a certification exam assistant helping clarify answers and explanations. Analyze these screenshots which include exam questions, answers, or explanations, and provide detailed help.

Your response MUST follow this exact structure with these section headers (use ### for headers):
### Answer Analysis
- Explain if the answer is correct or incorrect and why

### Correct Solution
- Provide the correct answer with explanation

### Key Concepts
- List the important concepts being tested in this question

### Related Knowledge
- Provide additional relevant information about the topic

### Study Resources
- Suggest what to study further on this topic

Ensure your explanations are clear, accurate, and educational.`;
      
      default:
        return `You are a coding interview assistant helping debug and improve solutions. Analyze these screenshots which include either error messages, incorrect outputs, or test cases, and provide detailed debugging help.

Your response MUST follow this exact structure with these section headers (use ### for headers):
### Issues Identified
- List each issue as a bullet point with clear explanation

### Specific Improvements and Corrections
- List specific code changes needed as bullet points

### Optimizations
- List any performance optimizations if applicable

### Explanation of Changes Needed
Here provide a clear explanation of why the changes are needed

### Key Points
- Summary bullet points of the most important takeaways

If you include code examples, use proper markdown code blocks with language specification (e.g. \`\`\`java).`;
    }
  }

  private createDebugUserPromptByMode(mode: string, problemInfo: any, language: string): string {
    switch(mode) {
      case "coding":
        return `I'm solving this coding problem: "${problemInfo.problem_statement}" in ${language}. I need help with debugging or improving my solution. Here are screenshots of my code, the errors or test cases. Please provide a detailed analysis with:
1. What issues you found in my code
2. Specific improvements and corrections
3. Any optimizations that would make the solution better
4. A clear explanation of the changes needed`;
      
      case "system_design":
        return `I'm working on this system design problem: "${problemInfo.problem_statement}". I need help with improving my design solution. Here are screenshots of my current design, potential issues, or additional requirements. Please provide a detailed analysis with:
1. What design issues you identified
2. Specific architecture improvements
3. How to enhance scalability
4. Data flow optimizations`;
      
      case "react":
        return `I'm implementing this React frontend problem: "${problemInfo.problem_statement}". I need help with debugging or improving my solution. Here are screenshots of my React code, UI issues, or requirements. Please provide a detailed analysis with:
1. What UI/UX issues you identified
2. How to improve component structure
3. Better state management approaches
4. Performance enhancements`;
      
      case "sql":
        return `I'm solving this SQL problem: "${problemInfo.problem_statement}". I need help with debugging or improving my query. Here are screenshots of my SQL code, error messages, or requirements. Please provide a detailed analysis with:
1. What issues you found in my query
2. Specific improvements and corrections
3. Any performance optimizations
4. Alternative query approaches`;
      
      case "linux":
        return `I'm working on this Linux/kernel problem: "${problemInfo.problem_statement}". I need help with debugging or improving my command-line solution. Here are screenshots of my commands, error messages, or requirements. Please provide a detailed analysis with:
1. What issues you found in my commands
2. Specific command improvements
3. Alternative commands that might work better
4. How to verify the solution works`;
      
      case "certification":
        return `I'm studying for a certification exam and encountered this question: "${problemInfo.question_text}". I need help understanding the correct answer. Here are screenshots of the question, answer choices, or my attempt. Please provide a detailed analysis with:
1. Whether my answer is correct or not and why
2. The correct solution with explanation
3. Key concepts being tested
4. Related knowledge I should know
5. What I should study further on this topic`;
      
      default:
        return `I need help with debugging or improving my solution. Here are screenshots of my code, the errors or test cases. Please provide a detailed analysis with:
1. What issues you found
2. Specific improvements and corrections
3. Any optimizations that would make the solution better
4. A clear explanation of the changes needed`;
    }
  }

  public cancelOngoingRequests(): void {
    let wasCancelled = false

    if (this.currentProcessingAbortController) {
      this.currentProcessingAbortController.abort()
      this.currentProcessingAbortController = null
      wasCancelled = true
    }

    if (this.currentExtraProcessingAbortController) {
      this.currentExtraProcessingAbortController.abort()
      this.currentExtraProcessingAbortController = null
      wasCancelled = true
    }

    // Reset hasDebugged flag
    this.deps.setHasDebugged(false)

    // Clear any pending state
    this.deps.setProblemInfo(null)

    const mainWindow = this.deps.getMainWindow()
    if (wasCancelled && mainWindow && !mainWindow.isDestroyed()) {
      // Send a clear message that processing was cancelled
      mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.NO_SCREENSHOTS)
    }
  }
}