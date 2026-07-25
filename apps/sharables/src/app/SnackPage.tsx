'use client'

import { diff } from 'deep-object-diff';
import { useState, useEffect, useRef } from 'react';
import { Chat } from '@ai-sdk/react';
import { DirectChatTransport, lastAssistantMessageIsCompleteWithApprovalResponses, stepCountIs } from 'ai';
import { v4 as uuidv4 } from 'uuid';
import {
  MessageSquare,
  Sparkles,
  Settings,
  Smartphone,
  Code2
} from 'lucide-react';
import { AndroidIcon, AppleIcon, WebIcon } from '@/components/PlatformIcons';

import { Button } from '@/components/ui/button';
import { ChatPanel, type ChatPanelMessage, type ComposerSuggestion, Project } from '@/components/ChatPanel';
import { Stage } from '@/components/Stage';
import { ModelSelectionModal, type ImageSelection } from '@/components/ModelSelectionModal';
import { CreateProjectModal } from '@/components/CreateProjectModal';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { cn } from '@/lib/utils';
import type { MessageUsageMetadata } from '@/lib/usage';
import { canUseAppetize } from '@/lib/preview-capabilities';
import { PROVIDERS, getApiKeyPolicy, resolveImageModeFor, type ProviderConfig } from '@/config/providers';
import { initializeProvider } from '@/utils/provider-init';
import {
  PENDING_REMIX_STORAGE_KEY,
  SNACK_CODE_CHANGES_DELAY,
  SNACK_DESCRIPTION,
  SNACK_NAME,
  SNACK_VERBOSE,
  buildSnackPreviewRoute,
  buildRemixRoute,
} from '@/lib/snack-preview';
const MODEL_SELECTION_STORAGE_KEY = 'codana_model_selection';
const PROJECTS_STORAGE_KEY = 'codana_projects';
const PROJECT_MESSAGES_STORAGE_PREFIX = 'codana_project_messages:';
// Agent loop cap per user message. The AI SDK's default (20) amputates large
// builds mid-file-tree; 100 lets one turn finish an app — prompt caching keeps
// the marginal cost of extra steps low, and the system prompt's
// scope-management rules bound how much a single turn takes on.
const MAX_AGENT_STEPS = 100;

// Default files for Snack
const defaultFiles = {
  'App.js': {
    type: 'CODE' as const,
    contents: `import React, { useState, useRef } from 'react';
import {
  Text,
  View,
  StyleSheet,
  Pressable,
  Animated,
  SafeAreaView,
} from 'react-native';

// 👋 Welcome! Edit anything below — the preview updates live.
// Try changing the name, emoji, or colors to make it yours.
const NAME = 'friend';
const EMOJI = '👋';
const BG_COLOR = '#f97316';      // orange (orange-400)
const ACCENT_COLOR = '#fbcf39';  // banana (yellow) — top circle, contrast pop
const GLOW_COLOR = '#fcd7aa';    // belly cream (soft glow)

export default function App() {
  const [taps, setTaps] = useState(0);
  const scale = useRef(new Animated.Value(1)).current;

  const handleTap = () => {
    setTaps((n) => n + 1);
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.9, duration: 130, useNativeDriver: false }),
      Animated.spring(scale, { toValue: 1, friction: 2, tension: 140, useNativeDriver: false }),
    ]).start();
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={[styles.bg, { backgroundColor: BG_COLOR }]}>
        <View style={[styles.blob, styles.blobOne, { backgroundColor: ACCENT_COLOR }]} />
        <View style={[styles.blob, styles.blobTwo, { backgroundColor: GLOW_COLOR }]} />

        <View style={styles.content}>
          <Text style={styles.greeting}>Hey, {NAME}</Text>
          <Text style={styles.subtitle}>tap the orb to say hi back</Text>

          <Pressable onPress={handleTap} hitSlop={20}>
            <Animated.View style={[styles.orb, { transform: [{ scale }] }]}>
              <Text style={styles.emoji}>{EMOJI}</Text>
            </Animated.View>
          </Pressable>

          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {taps} {taps === 1 ? 'wave' : 'waves'}
            </Text>
          </View>
        </View>

        <View style={styles.cta}>
          <Text style={styles.ctaEyebrow}>YOUR TURN ✨</Text>
          <Text style={styles.ctaTitle}>Ask the AI to make it yours</Text>
          <Text style={styles.ctaSubtitle}>
            “turn this into a habit tracker”{'\\n'}“make it a pomodoro timer”
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0f172a' },
  bg: { flex: 1, overflow: 'hidden' },
  blob: {
    position: 'absolute',
    width: 360,
    height: 360,
    borderRadius: 180,
    opacity: 0.55,
  },
  blobOne: { top: -120, right: -120 },
  blobTwo: { bottom: -140, left: -140, opacity: 0.4 },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  greeting: {
    fontSize: 36,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.5,
  },
  subtitle: {
    marginTop: 8,
    marginBottom: 48,
    fontSize: 15,
    color: 'rgba(255,255,255,0.75)',
  },
  orb: {
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 12 },
  },
  emoji: { fontSize: 86 },
  badge: {
    marginTop: 36,
    paddingVertical: 10,
    paddingHorizontal: 22,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.28)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  badgeText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  cta: {
    marginHorizontal: 20,
    marginBottom: 28,
    paddingVertical: 20,
    paddingHorizontal: 22,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.26)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.55)',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
  },
  ctaEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.6,
    color: 'rgba(255,255,255,0.85)',
    marginBottom: 6,
  },
  ctaTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  ctaSubtitle: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 19,
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
`
  }
};

// Dependencies every new project starts with, alongside defaultFiles. Snack
// pins the Expo-managed packages (expo-status-bar, react-native-screens,
// react-native-safe-area-context) to the versions bundled with the project's
// SDK when version is '*'. @react-navigation/native is NOT SDK-managed, so '*'
// would float to the latest major on npm — pin it to a major to stay
// compatible with the SDK's React Native. Existing persisted projects keep
// their own dependency list untouched.
const DEFAULT_DEPENDENCIES: Record<string, { version: string }> = {
  'expo-status-bar': { version: '*' },
  '@react-navigation/native': { version: '^7.0.0' },
  'react-native-screens': { version: '*' },
  'react-native-safe-area-context': { version: '*' },
};

function toAgentInitialFiles(files: Record<string, { contents?: string } | undefined> | undefined) {
  if (!files) {
    return [];
  }

  return Object.entries(files)
    .filter(([, file]) => typeof file?.contents === 'string')
    .map(([path, file]) => ({
      path,
      content: file!.contents as string,
    }));
}

type PersistedProject = Project & {
  dependencies?: Record<string, unknown>;
  snackSession?: {
    id?: string;
    channel?: string;
  };
};

// Single source for new-project construction so every creation path (initial,
// user-created, delete-recreate) seeds the same shape and DEFAULT_DEPENDENCIES.
function createNewProject(name = 'Current Project'): PersistedProject {
  return {
    id: uuidv4(),
    name,
    lastEdited: new Date().toLocaleString(),
    dependencies: { ...DEFAULT_DEPENDENCIES },
    snackSession: undefined,
  };
}


function formatLocation(error: { fileName?: string; lineNumber?: number; columnNumber?: number } | undefined) {
  if (!error?.fileName) {
    return '';
  }

  const line = typeof error.lineNumber === 'number' ? error.lineNumber : null;
  const column = typeof error.columnNumber === 'number' ? error.columnNumber : null;

  if (line && column) {
    return `${error.fileName}:${line}:${column}`;
  }

  if (line) {
    return `${error.fileName}:${line}`;
  }

  return error.fileName;
}

function buildSnackErrorPrompt(params: {
  title: string;
  message: string;
  location?: string;
  clientLabel?: string;
  stack?: string;
}) {
  const parts = [
    'I hit an Expo Snack runtime issue. Please fix it.',
    '',
    `Issue: ${params.title}`,
    `Message: ${params.message}`,
  ];

  if (params.location) {
    parts.push(`Location: ${params.location}`);
  }

  if (params.clientLabel) {
    parts.push(`Client: ${params.clientLabel}`);
  }

  if (params.stack) {
    parts.push('', 'Stack:', params.stack);
  }

  return parts.join('\n');
}

function createRuntimeErrorSuggestion(params: {
  id: string;
  title: string;
  message: string;
  location?: string;
  clientLabel?: string;
  stack?: string;
}): ComposerSuggestion {
  return {
    id: params.id,
    text: buildSnackErrorPrompt(params),
    preview: params.message,
  };
}

function getProjectPersistKey(projectId: string) {
  return `expo-snack:${projectId}`;
}

// Expo web player log noise that is NOT actionable by the user or the AI —
// e.g. its package-cache writes failing (it silently refetches instead).
const BENIGN_PLAYER_LOG_PATTERN =
  /Failed to execute 'put' on 'IDBObjectStore'|transaction is read-only/i;

// Packages Snack can never run, with the correction the model should apply.
// Enforced in the AddDependency tool so even models that ignore the system
// prompt's sandbox rules self-correct within the same turn.
const SNACK_UNSUPPORTED_PACKAGES: Record<string, string> = {
  'expo-router':
    'Snack has no app/ directory support. Use @react-navigation/native with @react-navigation/native-stack (or bottom-tabs) instead.',
};

function getProjectMessagesStorageKey(projectId: string) {
  return `${PROJECT_MESSAGES_STORAGE_PREFIX}${projectId}`;
}

async function loadPersistedProjectFiles(projectId: string) {
  // One-shot read at hydration: use a throwaway instance (fresh loadCache from
  // IndexedDB), NOT the shared getBrowserFs. Sharing here would register the
  // instance under this key BEFORE the agent supplies initialFiles, and the
  // agent's cached-instance seed would then never run on a new project.
  const { IndexedDBFileSystem } = await import('@nanocodana/browser');
  const fs = new IndexedDBFileSystem(getProjectPersistKey(projectId));
  const persistedPaths = await fs.list();

  if (persistedPaths.length === 0) {
    return null;
  }

  const entries = await Promise.all(
    persistedPaths.map(async (filePath) => {
      const stats = await fs.stat(filePath);
      if (!stats.isFile) {
        return null;
      }

      const content = await fs.readFile(filePath, 'utf8');
      return [
        filePath,
        {
          type: 'CODE' as const,
          contents: content,
        },
      ] as const;
    })
  );

  const files = Object.fromEntries(
    entries.filter((entry): entry is readonly [string, { type: 'CODE'; contents: string }] => entry !== null)
  );

  // Repair imports of any generated image module so the persisted code resolves
  // in Snack after a reload, no matter how the model originally wrote them.
  const imageNames = extractImageModuleNames(files);
  if (imageNames.size > 0) {
    for (const [path, file] of Object.entries(files)) {
      if (/\.(jsx?|tsx?)$/.test(path)) {
        file.contents = fixGeneratedImageImports(file.contents, imageNames);
      }
    }
  }

  return Object.keys(files).length > 0 ? files : null;
}

function serializeProjects(projects: Array<Project & { dependencies?: Record<string, unknown>; snackSession?: { id?: string; channel?: string } }>) {
  return projects.map(({ id, name, lastEdited, icon, dependencies, snackSession }) => ({
    id,
    name,
    lastEdited,
    icon,
    dependencies: dependencies ?? {},
    snackSession,
  }));
}

function loadProjectMessages(projectId: string): any[] {
  if (typeof window === 'undefined') {
    return [];
  }

  const storedValue = localStorage.getItem(getProjectMessagesStorageKey(projectId));
  if (!storedValue) {
    return [];
  }

  try {
    return JSON.parse(storedValue) as any[];
  } catch (error) {
    console.error('Failed to parse stored project messages', error);
    return [];
  }
}

function saveProjectMessages(projectId: string, messages: any[]) {
  if (typeof window === 'undefined') {
    return;
  }

  // Runs from a render effect on every messages update — a QuotaExceededError
  // on a large transcript must not crash the React tree mid-generation.
  // Losing persistence for one save is recoverable; unmounting is not.
  try {
    localStorage.setItem(
      getProjectMessagesStorageKey(projectId),
      JSON.stringify(messages)
    );
  } catch (error) {
    console.warn('Failed to persist project messages (storage full?)', error);
  }
}

function deleteProjectMessages(projectId: string) {
  if (typeof window === 'undefined') {
    return;
  }

  localStorage.removeItem(getProjectMessagesStorageKey(projectId));
}

interface SavedModelSelection {
  activeProviderId?: string;
  providers: Record<string, ProviderSelection>;
  image?: ImageSelection;
}

interface ProviderSelection {
  modelId?: string;
  apiKey?: string;
  customUrl?: string;
}

// React Native system prompt for the agent
// Downscale a (possibly large) image data URI to keep the bundled asset + chat
// preview light. Draws onto a canvas at `max` px on the longest side and
// re-encodes as PNG (preserves transparency for logos/icons). Browser-only.
async function downscaleDataUri(dataUri: string, max: number): Promise<string> {
  return await new Promise((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => {
      const longest = Math.max(image.width, image.height) || 1;
      const scale = Math.min(1, max / longest);
      const w = Math.max(1, Math.round(image.width * scale));
      const h = Math.max(1, Math.round(image.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('no 2d context'));
      ctx.drawImage(image, 0, 0, w, h);
      resolve(canvas.toDataURL('image/png'));
    };
    image.onerror = () => reject(new Error('image decode failed'));
    image.src = dataUri;
  });
}

// Model-proof safety net: LLMs frequently import a generated image module with
// a non-relative specifier (e.g. `from 'banana.js'` or `from 'assets/banana'`),
// which Expo Snack resolves against node_modules and fails. Rewrite any import
// of a KNOWN generated module to the correct sibling path `./<name>`. Scoped to
// our own generated names and to bare / assets-prefixed specifiers, so it never
// touches legitimate subdirectory imports like `./components/Banana`.
function fixGeneratedImageImports(content: string, names: Set<string>): string {
  if (names.size === 0) return content;
  let out = content;
  for (const name of names) {
    const n = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // import/export ... from '<opt ./><opt assets/>NAME<opt .js>'
    out = out.replace(
      new RegExp(`(from\\s*['"])(?:\\./)?(?:assets/)?${n}(?:\\.js)?(['"])`, 'g'),
      `$1./${name}$2`,
    );
    // require('<opt ./><opt assets/>NAME<opt .js>')
    out = out.replace(
      new RegExp(`(require\\(\\s*['"])(?:\\./)?(?:assets/)?${n}(?:\\.js)?(['"]\\s*\\))`, 'g'),
      `$1./${name}$2`,
    );
  }
  return out;
}

// Detect generated image modules by content (root-level `<name>.js` that
// default-exports a data:image URI). Used to repair their imports on load
// without relying on any in-memory state — survives reload.
function extractImageModuleNames(
  files: Record<string, { contents?: string } | undefined>,
): Set<string> {
  const names = new Set<string>();
  for (const [path, file] of Object.entries(files)) {
    const match = /^([\w-]+)\.js$/.exec(path);
    if (match && /export default ['"]data:image\//.test(file?.contents ?? '')) {
      names.add(match[1]);
    }
  }
  return names;
}

// Generate an image with the selected image model and return a data URI.
// Routing is by `mode`: `multimodal` (Gemini "Nano Banana") returns the image in
// result.files via generateText; `generateImage` (OpenAI, Imagen, Grok) goes
// through experimental_generateImage. `selection.id` picks which SDK to build.
async function generateImageDataUri(
  selection: ImageSelection,
  prompt: string,
): Promise<string> {
  const apiKey = selection.apiKey || '';
  // Older persisted picks may lack `mode`; resolve it the same way the picker does.
  const mode = selection.mode ?? resolveImageModeFor(selection.id, selection.modelId);

  if (mode === 'multimodal') {
    const { generateText } = await import('ai');
    const { createGoogleGenerativeAI } = await import('@ai-sdk/google');
    const model = createGoogleGenerativeAI({ apiKey })(selection.modelId);
    const result = await generateText({
      model,
      prompt,
      providerOptions: { google: { responseModalities: ['TEXT', 'IMAGE'] } },
    });
    const file = (result.files ?? []).find((f) => f.mediaType?.startsWith('image/'));
    if (!file) throw new Error('The model did not return an image.');
    return `data:${file.mediaType};base64,${file.base64}`;
  }

  // Dedicated image models: build the provider-specific model, then share one
  // generate-and-unwrap path. xAI and Google Imagen take aspectRatio, not size.
  const { experimental_generateImage } = await import('ai');
  type ImageModel = Parameters<typeof experimental_generateImage>[0]['model'];
  let model: ImageModel;
  let sizing: { size?: '1024x1024'; aspectRatio?: '1:1' };

  if (selection.id === 'grok') {
    const { createXai } = await import('@ai-sdk/xai');
    model = createXai({ apiKey }).image(selection.modelId);
    sizing = { aspectRatio: '1:1' };
  } else if (selection.id === 'gemini') {
    const { createGoogleGenerativeAI } = await import('@ai-sdk/google');
    model = createGoogleGenerativeAI({ apiKey }).image(selection.modelId);
    sizing = { aspectRatio: '1:1' };
  } else {
    // OpenAI (default)
    const { createOpenAI } = await import('@ai-sdk/openai');
    model = createOpenAI({ apiKey }).image(selection.modelId);
    sizing = { size: '1024x1024' };
  }

  const result = await experimental_generateImage({ model, prompt, ...sizing });
  const img = result.images[0];
  if (!img) throw new Error('The model did not return an image.');
  return `data:${img.mediaType};base64,${img.base64}`;
}

const REACT_NATIVE_SYSTEM_PROMPT = `You are an AI assistant helping users build React Native applications in Expo Snack. You have full control over the project and can create multi-file applications with proper structure.

CRITICAL RULES:
1. **Always use tools**: When users ask you to build something, IMMEDIATELY use the Write tool - DO NOT just describe the code!
2. **Multi-file support**: You can create multiple files - components, screens, utilities, etc. Use proper project structure.
3. **File management**:
   - Use Write tool to create/update any file (e.g., "components/Button.js", "screens/Home.js", "utils/api.js")
   - Use Delete tool to remove files if needed
   - Main entry point MUST be "App.js" or "App.tsx"
   - If you write App.tsx, Delete the template's App.js in the same turn — Snack loads App.js over App.tsx, so a leftover App.js hides your app
4. **Dependencies**: When you need a package, use the AddDependency tool to install it automatically.
   - Example: AddDependency("@react-navigation/stack", "^6.3.0")
   - Use "latest" for the version if you're unsure
   - Add dependencies BEFORE writing code that uses them
5. **Images**: If a GenerateImage tool is available and the user asks for a picture, logo, icon, avatar, or illustration, call it. It saves the image as a root-level JS module <name>.js. After generating, ADD IT TO THE APP by editing App.js — import the module with a leading ./ and NO file extension, then render it:
   - import { Image } from 'react-native';
   - import logo from './logo';   // NOT './logo.js' and NOT 'assets/logo'
   - <Image source={{ uri: logo }} style={{ width: 200, height: 200 }} />

SANDBOX BOUNDARIES (Expo Snack runs in the browser — these are hard limits, not preferences):
- No backends or servers: no Supabase, Firebase, databases, API keys, or edge functions. Mock all data in a services/ or data/ layer with realistic sample data.
- No expo-router (Snack has no app/ directory support). Use @react-navigation for all navigation.
- No native sign-in (Google/Apple OAuth) and no push notifications — both need real builds and credentials. Simulate instead: a fake sign-in screen, in-app banners for "notifications".
- No custom native modules or config plugins. Stick to the compatible packages listed below.
When a request assumes any of these (a backend, real auth, push), tell the user in ONE sentence what you're substituting and why, then build the working version. Never scaffold dead code for services that cannot exist here.

SCOPE MANAGEMENT (every token bills the user's own API key — build lean):
- For a large spec (many features, many screens, a whole product): do NOT build everything in one turn. Build a focused vertical slice first — the 2-3 core screens with mocked data, rendering in the preview.
- Then stop and summarize: what's built, what's deferred, and ask which slice to build next.
- Prefer Edit on existing files over rewriting them with Write; keep files small and focused.

REACT NATIVE BEST PRACTICES:
- Use functional components with hooks (useState, useEffect, etc.)
- Import from 'react' and 'react-native' correctly
- Use StyleSheet.create() for styles
- Export components properly (default export for App.js, named exports for others)
- Use proper TypeScript types if using .tsx files
- Follow React Native naming conventions (PascalCase for components)

EXPO SDK 55.0.0 COMPATIBLE PACKAGES:
✅ Core: expo, expo-status-bar, expo-constants, expo-font, expo-asset
✅ UI: expo-linear-gradient, expo-blur, @expo/vector-icons
✅ Navigation: @react-navigation/native, @react-navigation/stack, @react-navigation/bottom-tabs
✅ Storage: @react-native-async-storage/async-storage
✅ APIs: expo-camera, expo-location, expo-sensors, expo-haptics
✅ Animation: react-native-reanimated, react-native-gesture-handler

EXAMPLE WORKFLOWS:

**Simple app (single file):**
User: "Create a counter app"
You: [Use Write tool immediately]
- Write App.js with counter component, useState, buttons, and styles

**Complex app (multiple files):**
User: "Build a todo list app with navigation"
You: [Use tools immediately in this order]
1. AddDependency("@react-navigation/native", "latest")
2. AddDependency("@react-navigation/stack", "latest")
3. AddDependency("react-native-screens", "latest")
4. AddDependency("react-native-safe-area-context", "latest")
5. Write App.js (navigation container and stack navigator)
6. Write screens/HomeScreen.js (todo list view)
7. Write screens/AddTodoScreen.js (add new todo)
8. Write components/TodoItem.js (todo list item component)

**Code structure example:**
\`\`\`javascript
// App.js
import React from 'react';
import { View } from 'react-native';
import HomeScreen from './screens/HomeScreen';

export default function App() {
  return <HomeScreen />;
}

// screens/HomeScreen.js
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import CustomButton from '../components/CustomButton';

export default function HomeScreen() {
  const [count, setCount] = useState(0);
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Count: {count}</Text>
      <CustomButton onPress={() => setCount(count + 1)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  text: { fontSize: 24, marginBottom: 20 }
});

// components/CustomButton.js
import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';

export default function CustomButton({ onPress }) {
  return (
    <TouchableOpacity style={styles.button} onPress={onPress}>
      <Text style={styles.text}>Press Me</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: { backgroundColor: '#007AFF', padding: 15, borderRadius: 8 },
  text: { color: 'white', fontSize: 16, fontWeight: '600' }
});
\`\`\`

REMEMBER: Always use tools immediately! Users want working code, not explanations.`;

export default function SnackPage() {
  const webPreviewRef = useRef<Window | null>(null);
  const systemMessageCounterRef = useRef(0);
  // Always-current chat, so pushSystemMessage (called from long-lived tool
  // closures) positions messages against the latest history, not a stale one.
  const chatRef = useRef<Chat<any> | null>(null);
  // Base names of generated image modules (e.g. "banana"). Used to repair the
  // imports the model writes for them before syncing to Snack.
  const generatedModuleNamesRef = useRef<Set<string>>(new Set());
  // The live agent, reachable from editor callbacks. File sync goes through
  // agent.fs — the agent's own filesystem — so the app and the agent share one
  // store, and writes made through it are tracked exactly like tool writes
  // (onFilesChange fires, keeping Snack mirrored).
  const agentRef = useRef<any>(null);
  // The current project id as a ref, so async tool callbacks (e.g. a
  // GenerateImage that resolves seconds later) can detect a project switch.
  const currentProjectIdRef = useRef<string | null>(null);
  // Per-path debounce for mirroring editor edits into agent.fs, so rapid
  // typing doesn't fire an IndexedDB write per keystroke (Snack already
  // debounces its own preview via codeChangesDelay). Entries keep the pending
  // content so they can be FLUSHED (executed now) as well as cancelled.
  const fsWritePendingRef = useRef<
    Record<string, { timer: ReturnType<typeof setTimeout>; content: string }>
  >({});
  // Contents of editor-originated writes currently in flight, so the tracked
  // write's onFilesChange echo can be recognized and skipped (the editor/Snack
  // already have this content; re-applying a possibly-transformed echo would
  // fight the user's typing).
  const editorEchoRef = useRef<Map<string, string>>(new Map());

  const runFsWrite = (path: string, content: string) => {
    const agentFs = agentRef.current?.fs;
    if (!agentFs) return;
    // Freshness guard: if Snack's current content differs, someone (the agent,
    // or newer keystrokes) superseded this write — persisting it would clobber
    // the newer state. The newer state has its own persistence path.
    const current = snackRef.current?.getState?.()?.files?.[path]?.contents;
    if (typeof current === 'string' && current !== content) return;
    editorEchoRef.current.set(path, content);
    void agentFs.write(path, content).catch(() => {
      editorEchoRef.current.delete(path);
    });
  };
  const persistFileToAgentFs = (path: string, content: string) => {
    const pending = fsWritePendingRef.current;
    if (pending[path]) clearTimeout(pending[path].timer);
    pending[path] = {
      content,
      timer: setTimeout(() => {
        delete pending[path];
        runFsWrite(path, content);
      }, 400),
    };
  };
  const cancelPendingFsWrite = (path: string) => {
    const pending = fsWritePendingRef.current;
    if (pending[path]) {
      clearTimeout(pending[path].timer);
      delete pending[path];
    }
  };
  const cancelAllPendingFsWrites = () => {
    const pending = fsWritePendingRef.current;
    Object.values(pending).forEach(({ timer }) => clearTimeout(timer));
    fsWritePendingRef.current = {};
  };
  // Execute (not discard) everything pending — used before the project/agent
  // changes so the last keystrokes land in the CURRENT project's store.
  const flushAllPendingFsWrites = () => {
    const pending = fsWritePendingRef.current;
    fsWritePendingRef.current = {};
    Object.entries(pending).forEach(([path, { timer, content }]) => {
      clearTimeout(timer);
      runFsWrite(path, content);
    });
  };
  // Debounced transcript persistence: onMessagesChange fires on EVERY streamed
  // chunk, and serializing the whole transcript to localStorage each time is
  // measurable main-thread work on long sessions. Trailing-debounce the save;
  // flush before the project changes, cancel when the project is deleted.
  const pendingMessagesSaveRef = useRef<{
    timer: ReturnType<typeof setTimeout>;
    projectId: string;
    messages: any[];
  } | null>(null);
  const flushPendingMessagesSave = () => {
    const pending = pendingMessagesSaveRef.current;
    if (!pending) return;
    clearTimeout(pending.timer);
    pendingMessagesSaveRef.current = null;
    saveProjectMessages(pending.projectId, pending.messages);
  };
  const cancelPendingMessagesSave = (projectId: string) => {
    const pending = pendingMessagesSaveRef.current;
    if (pending?.projectId === projectId) {
      clearTimeout(pending.timer);
      pendingMessagesSaveRef.current = null;
    }
  };
  const queueMessagesSave = (projectId: string, messages: any[]) => {
    const pending = pendingMessagesSaveRef.current;
    // A different project's save must not be silently replaced — land it now.
    if (pending && pending.projectId !== projectId) flushPendingMessagesSave();
    if (pendingMessagesSaveRef.current) clearTimeout(pendingMessagesSaveRef.current.timer);
    pendingMessagesSaveRef.current = {
      projectId,
      messages,
      timer: setTimeout(() => {
        pendingMessagesSaveRef.current = null;
        saveProjectMessages(projectId, messages);
      }, 500),
    };
  };
  // Flush pending debounced fs writes and the transcript save when the page
  // unmounts, so the user's final keystrokes/messages persist.
  useEffect(() => {
    return () => {
      flushAllPendingFsWrites();
      flushPendingMessagesSave();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [showModelSelection, setShowModelSelection] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<ProviderConfig | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [apiKey, setApiKey] = useState('');
  const [customUrl, setCustomUrl] = useState('');
  const [providerSelections, setProviderSelections] = useState<Record<string, ProviderSelection>>({});
  const [imageSelection, setImageSelection] = useState<ImageSelection | null>(null);
  // The GenerateImage tool reads the selection through this ref at execute
  // time, so switching image models doesn't rebuild the agent — only turning
  // the capability on/off does (the tool must be added/removed then).
  const imageSelectionRef = useRef<ImageSelection | null>(null);
  useEffect(() => {
    imageSelectionRef.current = imageSelection;
  }, [imageSelection]);
  const [snack, setSnack] = useState<any>(null);
  const [snackState, setSnackState] = useState<any>(null);
  // Ref mirror for callbacks that need the live Snack outside render (the
  // debounced fs writes' freshness guard).
  const snackRef = useRef<any>(null);
  useEffect(() => {
    snackRef.current = snack;
  }, [snack]);
  const [composerSuggestion, setComposerSuggestion] = useState<ComposerSuggestion | null>(null);
  // Hero handoff from the marketing site: /?prompt=... lands here and pre-fills
  // the composer. Read synchronously so it's set before ChatPanel first mounts
  // (this component is client-only via dynamic ssr:false).
  const [initialComposerText, setInitialComposerText] = useState<string | undefined>(() => {
    if (typeof window === 'undefined') return undefined;
    return new URLSearchParams(window.location.search).get('prompt')?.trim() || undefined;
  });
  // Strip the param so a refresh or copied URL doesn't re-prefill.
  useEffect(() => {
    if (typeof window === 'undefined' || !initialComposerText) return;
    const url = new URL(window.location.href);
    url.searchParams.delete('prompt');
    window.history.replaceState(null, '', url.toString());
  }, [initialComposerText]);
  const [agent, setAgent] = useState<any>(null);
  const [chat, setChat] = useState<Chat<any> | null>(null);
  const [systemMessages, setSystemMessages] = useState<ChatPanelMessage[]>([]);
  // Generated-image previews, keyed by tool-call id, rendered inside the
  // GenerateImage tool card so the preview sits exactly where the tool ran.
  const [generatedImages, setGeneratedImages] = useState<Record<string, string>>({});
  const [isClientReady, setClientReady] = useState(false);
  const [selectedFile, setSelectedFile] = useState('App.js');

  const [mobileTab, setMobileTab] = useState<'chat' | 'web' | 'ios' | 'android' | 'code'>('chat');
  const [stageMode, setStageMode] = useState<'web' | 'app' | 'code'>('web');
  // Hydration-safe: SSR returns env default; client may upgrade via
  // NEXT_PUBLIC_SHOW_APPETIZE or ?appetize=1. See lib/preview-capabilities.ts.
  const [appetizeEnabled, setAppetizeEnabled] = useState(false);
  useEffect(() => { setAppetizeEnabled(canUseAppetize()); }, []);
  // If the flag flips off while on an Appetize-only tab, drop back to web.
  useEffect(() => {
    if (!appetizeEnabled && (mobileTab === 'ios' || mobileTab === 'android')) {
      setMobileTab('web');
      setStageMode('web');
    }
  }, [appetizeEnabled, mobileTab]);
  const [isMobile, setIsMobile] = useState(false);
  const [isExportingProject, setIsExportingProject] = useState(false);
  // Same-device Expo Go handoff needs a SAVED snack URL at tap time: Android
  // only allows launching an external app synchronously inside a user
  // gesture, so the button cannot await a save — and once Expo Go
  // foregrounds, this tab is frozen and can't serve code over the live
  // channel either. Keep the snack saved in the background while the mobile
  // preview is visible; state.url then carries snack=<id> for the deep link.
  useEffect(() => {
    if (!isMobile || !snack || mobileTab === 'chat' || mobileTab === 'code') return;
    const timer = window.setTimeout(() => {
      snack.saveAsync().catch(() => {
        // Offline or API hiccup — the handoff button stays in its
        // "Preparing" state until a later save succeeds.
      });
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [isMobile, snack, mobileTab, snackState?.files, snackState?.dependencies]);
  const [isSharing, setIsSharing] = useState(false);

  // Project Management State
  const [projects, setProjects] = useState<PersistedProject[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | undefined>(undefined);
  useEffect(() => {
    currentProjectIdRef.current = currentProjectId ?? null;
  }, [currentProjectId]);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const currentProject = projects.find(p => p.id === currentProjectId);
  const lastSnackIssueIdRef = useRef<string | null>(null);
  // Snack transiently clears and repopulates missingDependencies during
  // dependency-resolution passes. Clearing the deps suggestion only after two
  // CONSECUTIVE empty observations keeps the banner from flickering off/on
  // across those passes.
  const missingDepsEmptyStreakRef = useRef(0);

  const pushSystemMessage = (content: string, opts?: { position?: number }) => {
    systemMessageCounterRef.current += 1;
    const basePosition = opts?.position ?? (chatRef.current?.messages.length ?? chat?.messages.length ?? 0);

    setSystemMessages(prev => [
      ...prev,
      {
        id: uuidv4(),
        role: 'system',
        content,
        position: basePosition + systemMessageCounterRef.current / 1000,
      },
    ]);
  };

  const createAgentChat = (agentInstance: any, messages: any[] = []) =>
    new Chat<any>({
      messages: messages as any,
      transport: new DirectChatTransport({
        agent: agentInstance,
        // Stamp each assistant message with the turn's token usage (the
        // 'finish' part carries totals summed across every loop step). It
        // persists with the messages, so the usage meter survives reloads.
        // Keyed by a unique per-response id: a tool-approval resume streams
        // into the SAME assistant message and the chat deep-merges metadata,
        // so unique keys accumulate segments where a flat object would be
        // overwritten (dropping the pre-approval request's tokens).
        messageMetadata: ({ part }: { part: any }): MessageUsageMetadata | undefined =>
          part.type === 'finish' && part.totalUsage
            ? {
                usageSegments: {
                  [uuidv4()]: {
                    input: part.totalUsage.inputTokens,
                    output: part.totalUsage.outputTokens,
                    cacheRead: part.totalUsage.inputTokenDetails?.cacheReadTokens,
                    cacheWrite: part.totalUsage.inputTokenDetails?.cacheWriteTokens,
                  },
                },
              }
            : undefined,
      }),
      sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
    });

  // Keep the chat ref current so closures (e.g. tool executes) see live history.
  useEffect(() => {
    chatRef.current = chat;
  }, [chat]);

  // Drop in-memory image previews when switching projects so they don't leak
  // across sessions or linger from another project.
  useEffect(() => {
    setGeneratedImages({});
  }, [currentProjectId]);

  // Load projects from localStorage on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const savedModelSelection = localStorage.getItem(MODEL_SELECTION_STORAGE_KEY);
    if (savedModelSelection) {
      try {
        const parsed = JSON.parse(savedModelSelection) as SavedModelSelection | {
          providerId?: string;
          modelId?: string;
          apiKey?: string;
          customUrl?: string;
        };

        if ('providers' in parsed && parsed.providers) {
          setProviderSelections(parsed.providers);
          if ('image' in parsed && parsed.image) {
            setImageSelection(parsed.image as ImageSelection);
          }
          const provider = parsed.activeProviderId ? PROVIDERS[parsed.activeProviderId] : null;
          const activeSelection = provider && parsed.activeProviderId ? parsed.providers[parsed.activeProviderId] : null;

          if (provider) {
            setSelectedProvider(provider);
            setSelectedModel(activeSelection?.modelId ?? '');
            setApiKey(activeSelection?.apiKey ?? '');
            setCustomUrl(activeSelection?.customUrl ?? '');
          }
        } else if ('providerId' in parsed && parsed.providerId) {
          const provider = PROVIDERS[parsed.providerId];
          const migratedSelections: Record<string, ProviderSelection> = {
            [parsed.providerId]: {
              modelId: parsed.modelId,
              apiKey: parsed.apiKey,
              customUrl: parsed.customUrl,
            },
          };

          setProviderSelections(migratedSelections);

          if (provider && parsed.modelId) {
            setSelectedProvider(provider);
            setSelectedModel(parsed.modelId);
            setApiKey(parsed.apiKey ?? '');
            setCustomUrl(parsed.customUrl ?? '');
          }
        }
      } catch (error) {
        console.error('Failed to parse saved model selection', error);
      }
    }

    const savedProjects = localStorage.getItem(PROJECTS_STORAGE_KEY);
    if (savedProjects) {
      try {
        const parsed = JSON.parse(savedProjects).map((project: any) => ({
          id: project.id,
          name: project.name,
          lastEdited: project.lastEdited,
          icon: project.icon,
          dependencies: project.dependencies ?? {},
          snackSession: project.snackSession,
        })) as PersistedProject[];
        if (parsed.length > 0) {
          setProjects(parsed);
          const sorted = [...parsed].sort((a: Project, b: Project) => new Date(b.lastEdited).getTime() - new Date(a.lastEdited).getTime());
          setCurrentProjectId(sorted[0].id);
        } else {
          // Initialize default project if array is empty
          initializeDefaultProject();
        }
      } catch (e) {
        console.error('Failed to parse projects', e);
        initializeDefaultProject();
      }
    } else {
      initializeDefaultProject();
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (!selectedProvider && !imageSelection) {
      localStorage.removeItem(MODEL_SELECTION_STORAGE_KEY);
      return;
    }

    const selection: SavedModelSelection = {
      activeProviderId: selectedProvider?.id,
      providers: providerSelections,
      image: imageSelection ?? undefined,
    };

    localStorage.setItem(MODEL_SELECTION_STORAGE_KEY, JSON.stringify(selection));
  }, [selectedProvider, providerSelections, imageSelection]);

  const initializeDefaultProject = () => {
    const defaultProject = createNewProject();
    setProjects([defaultProject]);
    setCurrentProjectId(defaultProject.id);
    localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(serializeProjects([defaultProject])));
  };

  // Consume a pending remix stashed by the share preview page ("Remix this
  // app"): seed a NEW project's persisted store with the shared files, then
  // make it current — the normal project-switch hydration picks the files up
  // from there, and the agent fs (same IndexedDB store) sees them too.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = localStorage.getItem(PENDING_REMIX_STORAGE_KEY);
    if (!raw) return;
    localStorage.removeItem(PENDING_REMIX_STORAGE_KEY);

    let payload: {
      name?: string;
      files?: Record<string, { type?: string; contents?: string }>;
      dependencies?: Record<string, { version: string; handle?: string }>;
    };
    try {
      payload = JSON.parse(raw);
    } catch {
      return;
    }
    if (!payload?.files || typeof payload.files !== 'object') return;
    const codeFiles = Object.entries(payload.files).filter(
      ([, file]) => file?.type === 'CODE' && typeof file.contents === 'string'
    );
    if (codeFiles.length === 0) return;

    // No cancellation: removing the stash key above already makes this
    // one-shot (StrictMode's second mount finds nothing), and cancelling on
    // cleanup would abort the seed on the dev double-mount.
    (async () => {
      const project = createNewProject(payload.name ? `${payload.name} (remix)` : 'Remixed app');
      if (payload.dependencies && Object.keys(payload.dependencies).length > 0) {
        project.dependencies = payload.dependencies;
      }

      // Files must be fully persisted BEFORE the project becomes current, so
      // the switch hydration reads a complete store.
      const { IndexedDBFileSystem } = await import('@nanocodana/browser');
      const fs = new IndexedDBFileSystem(getProjectPersistKey(project.id));
      for (const [path, file] of codeFiles) {
        await fs.writeFile(path, file.contents as string);
      }

      setProjects((prev) => {
        const next = [project, ...prev];
        localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(serializeProjects(next)));
        return next;
      });
      setSystemMessages([]);
      setChat(null);
      setCurrentProjectId(project.id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save current project state when files, dependencies, or session metadata change
  useEffect(() => {
    if (!currentProjectId || !snackState) return;

    setProjects((prevProjects) => {
      const projectIndex = prevProjects.findIndex((project) => project.id === currentProjectId);
      if (projectIndex === -1) {
        return prevProjects;
      }

      const currentProject = prevProjects[projectIndex];
      const nextSnackSession = {
        id: snackState.id,
        channel: snackState.channel,
      };
      const nextLastEdited = new Date().toLocaleString();

      if (
        currentProject.dependencies === snackState.dependencies &&
        currentProject.snackSession?.id === nextSnackSession.id &&
        currentProject.snackSession?.channel === nextSnackSession.channel
      ) {
        return prevProjects;
      }

      const updatedProject: PersistedProject = {
        ...currentProject,
        dependencies: snackState.dependencies,
        snackSession: nextSnackSession,
        lastEdited: nextLastEdited,
      };

      const nextProjects = [...prevProjects];
      nextProjects[projectIndex] = updatedProject;
      localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(serializeProjects(nextProjects)));
      return nextProjects;
    });
  }, [snackState?.files, snackState?.dependencies, snackState?.id, snackState?.channel, currentProjectId]);

  const handleCreateProject = (name: string) => {
    // Persist the outgoing project's last keystrokes into ITS store before the
    // agent (and agentRef) are rebuilt for the new project.
    flushAllPendingFsWrites();
    flushPendingMessagesSave();
    const newProject = createNewProject(name);

    const newProjects = [newProject, ...projects];
    setProjects(newProjects);
    setCurrentProjectId(newProject.id);
    localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(serializeProjects(newProjects)));

    // Reset Snack to default files
    if (snack && snackState?.files) {
      const filesToRemove: Record<string, null> = {};
      Object.keys(snackState.files).forEach(path => {
        if (!defaultFiles[path as keyof typeof defaultFiles]) {
          filesToRemove[path] = null;
        }
      });
      snack.updateFiles({ ...defaultFiles, ...filesToRemove });
    } else if (snack) {
      snack.updateFiles(defaultFiles);
    }

    // Reset dependencies
    if (snack && snackState?.dependencies) {
      const depsToRemove: Record<string, null> = {};
      Object.keys(snackState.dependencies).forEach(dep => {
        depsToRemove[dep] = null;
      });
      snack.updateDependencies(depsToRemove);
    }

    // Clear conversation for new project
    setSystemMessages([]);
    setChat(null);
    setIsCreateModalOpen(false);
  };

  const handleDeleteProject = async (projectId: string) => {
    const project = projects.find((entry) => entry.id === projectId);
    if (!project) return;

    const shouldDelete = window.confirm(`Delete "${project.name}"?`);
    if (!shouldDelete) return;

    const remainingProjects = projects.filter((entry) => entry.id !== projectId);

    // Discard pending debounced writes so a straggler can't resurrect data
    // into the store we're about to clear.
    cancelAllPendingFsWrites();
    cancelPendingMessagesSave(projectId);
    try {
      // Clear through the SHARED instance so the live agent's cache is
      // emptied too, not just the database underneath it.
      const { getBrowserFs } = await import('@nanocodana/browser');
      await getBrowserFs(getProjectPersistKey(projectId)).clear();
    } catch (error) {
      console.error('Failed to clear persisted project files', error);
    }

    deleteProjectMessages(projectId);

    if (remainingProjects.length === 0) {
      const defaultProject = createNewProject();

      setProjects([defaultProject]);
      setCurrentProjectId(defaultProject.id);
      setSelectedFile('App.js');
      setSystemMessages([]);
      setChat(null);
      localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(serializeProjects([defaultProject])));
      return;
    }

    setProjects(remainingProjects);
    localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(serializeProjects(remainingProjects)));

    if (currentProjectId === projectId) {
      setCurrentProjectId(remainingProjects[0].id);
      setSelectedFile('App.js');
      setSystemMessages([]);
      setChat(null);
    }
  };

  const handleSelectProject = (projectId: string) => {
    const project = projects.find(p => p.id === projectId);
    if (!project || !snack) return;

    // Persist the outgoing project's last keystrokes into ITS store now —
    // once agentRef swaps to the new project, a pending timer would write
    // them into the wrong store.
    flushAllPendingFsWrites();
    flushPendingMessagesSave();
    setCurrentProjectId(projectId);

    setSystemMessages([]);
    setChat(null);
  };

  const handleExportProject = async () => {
    if (!snack || typeof window === 'undefined') return;

    try {
      setIsExportingProject(true);
      const downloadUrl = await snack.getDownloadURLAsync();
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.click();
    } finally {
      setIsExportingProject(false);
    }
  };

  const handleShare = async (
    platforms: string[],
    mode: 'preview' | 'code' = 'preview',
    includeCode?: boolean
  ): Promise<string | null> => {
    if (!snack || typeof window === 'undefined') return null;
    setIsSharing(true);
    try {
      const result = await snack.saveAsync();
      if (!result?.hashId) return null;
      const route =
        mode === 'code'
          ? buildRemixRoute(result.hashId)
          : buildSnackPreviewRoute(result.hashId, platforms, includeCode);
      // Preview links may already be absolute (an <appId>.sharable.app
      // subdomain); remix and dev-fallback links are relative to the builder.
      return route.startsWith('http') ? route : `${window.location.origin}${route}`;
    } catch (error) {
      console.error('Failed to share Snack', error);
      return null;
    } finally {
      setIsSharing(false);
    }
  };

  // Sync stage mode when mobile tab changes
  const handleMobileTabChange = (tab: 'chat' | 'web' | 'ios' | 'android' | 'code') => {
    setMobileTab(tab);
    if (tab === 'web') setStageMode('web');
    if (tab === 'ios' || tab === 'android') setStageMode('app');
    if (tab === 'code') setStageMode('code');
  };

  // Handle responsive state to prevent double mounting of Stage/iframe
  useEffect(() => {
    const checkMobile = () => {
      // 1280px ('xl'): below this the chat + phone + side-QR split gets too
      // cramped — the chat title wraps and pills clip, and the centered phone
      // collides with the side QR. Use the single-column tabbed layout instead.
      setIsMobile(window.innerWidth < 1280);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Initialize Snack after the initial project is known so persisted files can win on first load.
  useEffect(() => {
    if (typeof window === 'undefined' || snack || !currentProjectId) return;

    const initializeSnack = async () => {
      const { Snack } = await import('snack-sdk');
      const project = projects.find(p => p.id === currentProjectId);
      const persistedFiles = await loadPersistedProjectFiles(currentProjectId);
      const initialFiles = persistedFiles ?? defaultFiles;
      const initialDependencies = (project?.dependencies ?? {}) as Record<string, any>;
      const snackSession = project?.snackSession;

      const snackInstance = new Snack({
        files: initialFiles,
        name: SNACK_NAME,
        description: SNACK_DESCRIPTION,
        codeChangesDelay: SNACK_CODE_CHANGES_DELAY,
        verbose: SNACK_VERBOSE,
        webPreviewRef,
        webPlayerURL: `${window.location.origin}/api/web-player/%%SDK_VERSION%%`,
        dependencies: initialDependencies,
        online: true,
        id: snackSession?.id,
        channel: snackSession?.channel,
      });

      setSnack(snackInstance);
      setSnackState(snackInstance.getState());
      setClientReady(true);
    };

    initializeSnack();
  }, [snack, currentProjectId, projects]);

  useEffect(() => {
    if (!snack || !currentProjectId) return;

    const hydrateProject = async () => {
      const project = projects.find(p => p.id === currentProjectId);
      if (!project) return;

      const persistedFiles = await loadPersistedProjectFiles(currentProjectId);
      const nextFiles: Record<string, { type: 'CODE'; contents: string }> = persistedFiles ?? defaultFiles;
      // Re-learn generated image module names so live edits this session are repaired too.
      for (const name of extractImageModuleNames(nextFiles)) {
        generatedModuleNamesRef.current.add(name);
      }
      const currentFiles = snack.getState().files || {};
      const filesToRemove: Record<string, null> = {};

      Object.keys(currentFiles).forEach(path => {
        if (!nextFiles[path]) {
          filesToRemove[path] = null;
        }
      });

      snack.updateFiles({
        ...nextFiles,
        ...filesToRemove,
      });

      const currentDependencies = snack.getState().dependencies || {};
      const nextDependencies = project.dependencies ?? {};
      const depsToRemove: Record<string, null> = {};

      Object.keys(currentDependencies).forEach(dep => {
        if (!nextDependencies[dep]) {
          depsToRemove[dep] = null;
        }
      });

      snack.updateDependencies({
        ...nextDependencies,
        ...depsToRemove,
      });
    };

    hydrateProject();
  }, [snack, currentProjectId, projects]);

  // Whether the agent needs the GenerateImage tool at all. Which model/key the
  // tool uses comes from imageSelectionRef, so only this boolean (not the
  // selection details) participates in the rebuild.
  const hasImageTool = Boolean(imageSelection?.apiKey);

  // Initialize Agent when provider/model is selected
  useEffect(() => {
    if (!selectedProvider || !selectedModel || !snack) return;
    if (getApiKeyPolicy(selectedProvider) === 'required' && !apiKey) return;

    // Staleness guard: provider init awaits network probes, so a rapid
    // project/model switch can leave two runs in flight — only the run
    // matching the CURRENT deps may install its agent, or the last run to
    // finish (not the right one) would win agentRef/chat and bind the UI to
    // another project's store.
    let cancelled = false;
    // The project this agent belongs to, captured for the tool closures: a
    // GenerateImage resolving seconds later must write to ITS project even if
    // the user has switched away (and skip UI side effects when stale).
    const ownProjectId = currentProjectId ?? 'default';
    let ownAgent: any = null;

    const initializeAgent = async () => {
      const { BrowserAgent } = await import('@nanocodana/browser');
      const { z } = await import('zod');
      const tab =
        selectedProvider.type === 'local'
          ? 'local'
          : selectedProvider.id === 'custom'
            ? 'custom'
            : 'providers';

      const initialized = await initializeProvider(tab, {
        providerId: selectedProvider.id,
        apiKey,
        modelId: selectedModel,
        customUrl,
        name: selectedProvider.name,
        baseURL: customUrl,
      });
      if (cancelled) return;

      // Create custom AddDependency tool
      const addDependencyTool = {
        description: 'Add a dependency to the React Native project. Use this when you need an npm package.',
        parameters: z.object({
          name: z.string().describe('The npm package name (e.g., "@react-navigation/stack")'),
          version: z.string().describe('The version to install (e.g., "^6.3.0" or "latest")')
        }),
        execute: async (args: { name: string; version: string }) => {
          // Deterministic guard for packages Snack can NEVER run — a cheerful
          // "✅ Added" here would send the model down an unrecoverable path.
          const unsupported = SNACK_UNSUPPORTED_PACKAGES[args.name];
          if (unsupported) {
            return `Error: ${args.name} is not supported in Expo Snack. ${unsupported}`;
          }
          snack.updateDependencies({
            [args.name]: { version: args.version }
          });
          pushSystemMessage(`✅ Added dependency: ${args.name}@${args.version}`);
          return `Successfully added ${args.name}@${args.version} to the project`;
        }
      };

      const tools: Record<string, unknown> = {
        AddDependency: addDependencyTool,
      };

      // Image generation is offered when an image model is picked in the model
      // picker's Image tab (separate from the chat model, with its own key). The
      // agent gets a GenerateImage tool: it generates via the chosen provider,
      // writes the image into the project as a data-URI JS module (so it renders
      // in the live preview), and previews it in chat. The big base64 never goes
      // back to the model — only a short "saved to ./assets/<name>" instruction.
      if (hasImageTool) {
        tools.GenerateImage = {
          description:
            'Generate an image from a text prompt and add it to the app as a ready-to-use asset. ' +
            'Saves a root-level JS module <name>.js that default-exports an image data URI. ' +
            'After calling it, edit App.js: import { Image } from "react-native"; import <name> from "./<name>" ' +
            '(leading ./ and NO .js extension); then render <Image source={{ uri: <name> }} style={{ width: 200, height: 200 }} />. ' +
            'Use for any picture, logo, icon, avatar, or illustration the app needs.',
          parameters: z.object({
            prompt: z.string().describe('A detailed description of the image to generate.'),
            name: z
              .string()
              .describe('Asset name, letters/numbers only, no extension (e.g. "logo" → assets/logo.js).'),
          }),
          execute: async (
            { prompt, name }: { prompt: string; name: string },
            opts?: { toolCallId?: string },
          ) => {
            const imageSel = imageSelectionRef.current;
            if (!imageSel) {
              return 'Image generation is not configured. Ask the user to pick an image model in the model selector.';
            }
            let safeName = (name || 'image').replace(/[^a-zA-Z0-9_]/g, '') || 'image';
            // Never let a generated module clobber the entry point or a reserved name.
            if (/^(app|index)$/i.test(safeName)) safeName = `${safeName}Image`;
            try {
              const rawUri = await generateImageDataUri(imageSel, prompt);
              const dataUri = await downscaleDataUri(rawUri, 384).catch(() => rawUri);

              // Write the data-URI module at the PROJECT ROOT (not under
              // assets/, which Expo Snack treats as a static-asset dir). A
              // root-level sibling of App.js gives the most reliable relative
              // import.
              const file = `${safeName}.js`;
              const moduleSource =
                `// Auto-generated image from prompt: ${JSON.stringify(prompt)}\n` +
                `export default ${JSON.stringify(dataUri)};\n`;
              // Generation can take seconds; if the user switched projects
              // meanwhile, the shared Snack now shows ANOTHER project — skip
              // UI side effects and only persist into this tool's own store.
              const isCurrentProject = currentProjectIdRef.current === ownProjectId;
              if (isCurrentProject) {
                snack.updateFiles({ [file]: { type: 'CODE', contents: moduleSource } });
              }
              // Remember the name so we can repair however the model imports it.
              generatedModuleNamesRef.current.add(safeName);
              // Write through THIS agent's own filesystem (not the live ref,
              // which may already point at another project's agent) so the
              // module lands in the project that asked for it and survives
              // reload.
              try {
                await ownAgent?.fs?.write(file, moduleSource);
              } catch {
                // Best-effort: the live preview still works via snack.updateFiles.
              }

              // Chat preview (UI-only) — rendered inside this tool's card via its
              // tool-call id, so it appears exactly where GenerateImage ran.
              if (isCurrentProject && opts?.toolCallId) {
                const toolCallId = opts.toolCallId;
                setGeneratedImages((prev) => ({ ...prev, [toolCallId]: dataUri }));
              }

              return (
                `Saved the image module as ${safeName}.js. Now edit App.js to show it. Use these EXACT lines:\n` +
                `  import { Image } from 'react-native';\n` +
                `  import ${safeName} from './${safeName}';   // exactly this path: leading ./ and NO .js extension\n` +
                `  <Image source={{ uri: ${safeName} }} style={{ width: 200, height: 200 }} />\n` +
                `Do not import it as '${safeName}.js' or 'assets/${safeName}' — that will fail to resolve in Snack.`
              );
            } catch (err: unknown) {
              const message = err instanceof Error ? err.message : String(err);
              pushSystemMessage(`⚠️ Image generation failed: ${message}`);
              return `Image generation failed: ${message}`;
            }
          },
        };
      }

      const agentInstance = BrowserAgent({
        model: initialized.model,
        toolMiddleware: initialized.toolMiddleware,
        systemPrompt: REACT_NATIVE_SYSTEM_PROMPT,
        stopWhen: stepCountIs(MAX_AGENT_STEPS),
        persist: true,
        persistKey: getProjectPersistKey(ownProjectId),
        // Seeded inside the fs's ready gate, and ONLY when the store is empty
        // — i.e. a brand-new project, whose correct contents are the default
        // template. (Snack's current files must not be used here: on a project
        // switch they still hold the PREVIOUS project's code.)
        initialFiles: toAgentInitialFiles(defaultFiles),
        tools,
        onFilesChange: (changes) => {
          // This closure belongs to ONE project's agent. If the user has
          // switched away, the shared Snack now displays another project —
          // late writes from this agent must not bleed into it.
          if (currentProjectIdRef.current !== ownProjectId) return;
          // Mirror the agent's filesystem changes into Snack (the preview).
          const filesToUpdate: Record<string, any> = {};
          changes.forEach(({ path, content }) => {
            if (content !== undefined) {
              // Editor-originated writes echo back through here (agent.fs
              // writes are tracked). Snack already has that exact content —
              // skip it, so the echo can't fight newer keystrokes or apply
              // the import-repair transform to user-typed code.
              if (editorEchoRef.current.get(path) === content) {
                editorEchoRef.current.delete(path);
                return;
              }
              // Repair any non-relative import of a generated image module so
              // it resolves in Snack, regardless of how the model wrote it.
              const contents = /\.(jsx?|tsx?)$/.test(path)
                ? fixGeneratedImageImports(content, generatedModuleNamesRef.current)
                : content;
              filesToUpdate[path] = {
                type: 'CODE',
                contents,
              };
            } else {
              // A deleted file must be removed from Snack too, or a stale
              // screen/component lingers in the preview and can still import.
              filesToUpdate[path] = null;
            }
          });
          if (Object.keys(filesToUpdate).length > 0) {
            snack.updateFiles(filesToUpdate);
          }
        }
      });
      ownAgent = agentInstance;
      if (cancelled) return;

      const persistedMessages = loadProjectMessages(ownProjectId);

      agentRef.current = agentInstance;
      setAgent(agentInstance);
      setChat(createAgentChat(agentInstance, persistedMessages));
      systemMessageCounterRef.current = 0;
      setSystemMessages([
        {
          id: uuidv4(),
          role: 'system',
          content: `✓ Connected to ${selectedProvider.name} - ${selectedModel}${imageSelectionRef.current ? ` · 🎨 ${imageSelectionRef.current.modelId}` : ''}`,
          position: -1,
        },
      ]);
    };

    initializeAgent().catch((error) => {
      if (cancelled) return;
      console.error('Failed to initialize agent', error);
      pushSystemMessage(
        `⚠️ Failed to connect to ${selectedProvider.name}: ${error instanceof Error ? error.message : String(error)}`,
      );
    });

    return () => {
      cancelled = true;
    };
  }, [selectedProvider, selectedModel, apiKey, customUrl, snack, currentProjectId, hasImageTool]);

  // Listen for Snack state changes and auto-detect missing dependencies
  useEffect(() => {
    if (!snack) return;

    const publishSnackIssue = (nextSuggestion: ComposerSuggestion) => {
      if (lastSnackIssueIdRef.current === nextSuggestion.id) {
        return;
      }

      lastSnackIssueIdRef.current = nextSuggestion.id;
      setComposerSuggestion(nextSuggestion);
    };

    const clearSnackIssue = () => {
      if (!lastSnackIssueIdRef.current && !composerSuggestion) {
        return;
      }

      lastSnackIssueIdRef.current = null;
      setComposerSuggestion(null);
    };

    const listeners = [
      snack.addStateListener((state: any, prevState: any) => {
        console.log('Snack state changed: ', diff(prevState, state));
        setSnackState(state);

        const runtimeErrorEntry = Object.entries(state.connectedClients || {}).find(([clientId, client]: any) => {
          if (client?.status !== 'error' || !client?.error?.message) {
            return false;
          }

          const previousClient = prevState.connectedClients?.[clientId];
          return previousClient?.error?.message !== client.error.message ||
            previousClient?.error?.stack !== client.error.stack;
        }) as [string, any] | undefined;

        if (runtimeErrorEntry) {
          const [clientId, client] = runtimeErrorEntry;
          const error = client.error;
          const location = formatLocation(error);
          const clientLabel = [client.name, client.platform].filter(Boolean).join(' • ') || clientId;

          publishSnackIssue(createRuntimeErrorSuggestion({
            id: `runtime:${clientId}:${error.message}:${location}:${error.stack ?? ''}`,
            title: 'Preview runtime error',
            message: error.message,
            location,
            clientLabel,
            stack: error.stack,
          }));
          return;
        }

        const dependencyErrorEntry = Object.entries(state.dependencies || {}).find(([name, dependency]: any) => {
          const previousDependency = prevState.dependencies?.[name];
          return dependency?.error && previousDependency?.error !== dependency.error;
        }) as [string, any] | undefined;

        if (dependencyErrorEntry) {
          const [name, dependency] = dependencyErrorEntry;
          const dependencyError =
            dependency.error instanceof Error
              ? dependency.error.message
              : typeof dependency.error === 'string'
                ? dependency.error
                : JSON.stringify(dependency.error);

          publishSnackIssue(createRuntimeErrorSuggestion({
            id: `dependency:${name}:${dependencyError}`,
            title: `Dependency problem in ${name}`,
            message: dependencyError,
          }));
          return;
        }

        const fileErrorEntry = Object.entries(state.files || {}).find(([path, file]: any) => {
          const previousFile = prevState.files?.[path];
          return file?.error && previousFile?.error !== file.error;
        }) as [string, any] | undefined;

        if (fileErrorEntry) {
          const [path, file] = fileErrorEntry;
          const fileError =
            file.error instanceof Error
              ? file.error.message
              : typeof file.error === 'string'
                ? file.error
                : JSON.stringify(file.error);

          publishSnackIssue(createRuntimeErrorSuggestion({
            id: `file:${path}:${fileError}`,
            title: `File upload problem in ${path}`,
            message: fileError,
            location: path,
          }));
          return;
        }

        const hasActiveRuntimeError = Object.values(state.connectedClients || {}).some(
          (client: any) => client?.status === 'error' && client?.error?.message
        );
        const hasActiveDependencyError = Object.values(state.dependencies || {}).some(
          (dependency: any) => dependency?.error
        );
        const hasActiveFileError = Object.values(state.files || {}).some(
          (file: any) => file?.error
        );
        const hasActiveError = hasActiveRuntimeError || hasActiveDependencyError || hasActiveFileError;

        // Missing dependencies (typically unmet peer deps — e.g. zustand
        // wanting immer/@types/react): offer to let the AI add them with its
        // AddDependency tool. The banner IS the announcement — deduped by its
        // stable sorted-names id. Real errors above take priority.
        const missingDeps: Record<string, any> = state.missingDependencies ?? {};
        const missingNames = Object.keys(missingDeps);
        if (missingNames.length > 0) {
          missingDepsEmptyStreakRef.current = 0;
          if (!hasActiveError) {
            const specs = missingNames.map((name) => {
              const wanted = missingDeps[name]?.wantedVersion;
              return wanted ? `${name}@${wanted}` : name;
            });
            publishSnackIssue({
              id: `missing-deps:${[...missingNames].sort().join(',')}`,
              title: 'Missing dependencies',
              text: `Snack reports missing dependencies (unmet peer dependencies of installed packages). Add each of them with the AddDependency tool, and do not change any code: ${specs.join(', ')}`,
              preview: missingNames.join(', '),
              action: 'Add them',
              tone: 'info',
            });
          }
          return;
        }
        missingDepsEmptyStreakRef.current++;

        // Both entry files present: Snack loads App.js over App.tsx, so the
        // template's leftover App.js silently hides the real app. Deterministic
        // guard — works even when a model ignores the system-prompt rule.
        if (state.files?.['App.js'] && state.files?.['App.tsx'] && !hasActiveError) {
          publishSnackIssue({
            id: 'entry-shadowing:App.js',
            title: 'Two entry files',
            text: 'Both App.js and App.tsx exist. Snack loads App.js, which hides App.tsx. Delete whichever file is NOT the real app entry (usually the leftover template App.js) using the Delete tool, and change nothing else.',
            preview: 'App.js is shadowing App.tsx',
            action: 'Fix it',
            tone: 'info',
          });
          return;
        }

        // Clear only after TWO consecutive empty observations — Snack's
        // resolution passes transiently empty missingDependencies, and a
        // single-pass clear would flicker the banner off/on each cycle.
        if (!hasActiveError && missingDepsEmptyStreakRef.current >= 2) {
          clearSnackIssue();
        }
      }),
      snack.addLogListener((log: any) => {
        console.log('Snack log:', log.message);

        if (log.type !== 'error' && log.type !== 'warn') {
          return;
        }

        // Known-benign web player noise must not become a red "Fix it" banner:
        // the player failing to WRITE ITS OWN package cache (snack-packages
        // IndexedDB) is harmless — it just refetches — and the AI can't fix it.
        if (BENIGN_PLAYER_LOG_PATTERN.test(String(log.message ?? ''))) {
          return;
        }

        const location = formatLocation(log.error);
        const clientLabel = log.connectedClient
          ? [log.connectedClient.name, log.connectedClient.platform].filter(Boolean).join(' • ')
          : undefined;

        publishSnackIssue(createRuntimeErrorSuggestion({
          id: `log:${log.type}:${log.message}:${location}:${log.error?.stack ?? ''}`,
          title: log.type === 'error' ? 'Console error from preview' : 'Console warning from preview',
          message: log.message,
          location,
          clientLabel,
          stack: log.error?.stack,
        }));
      }),
    ];

    return () => listeners.forEach((listener) => listener());
  }, [snack, composerSuggestion]);

  const handleModelSelection = (selection: {
    provider: ProviderConfig;
    modelId: string;
    apiKey?: string;
    customUrl?: string;
  }) => {
    setProviderSelections(prev => ({
      ...prev,
      [selection.provider.id]: {
        modelId: selection.modelId,
        apiKey: selection.apiKey,
        customUrl: selection.customUrl,
      },
    }));
    setSelectedProvider(selection.provider);
    setSelectedModel(selection.modelId);
    setApiKey(selection.apiKey ?? '');
    setCustomUrl(selection.customUrl ?? '');
    setShowModelSelection(false);
  };

  // Image-model pick (separate, optional). null clears it (image generation
  // off). The modal closes itself after a model is chosen ("Use" → onClose);
  // selecting null leaves it open. The GenerateImage tool reads the selection
  // from a ref, so model-only changes don't rebuild the agent — announce those
  // here. Turning the capability on/off DOES rebuild, and that rebuild's fresh
  // "Connected" line does the announcing (a notice here would be wiped by it).
  const handleSelectImage = (selection: ImageSelection | null) => {
    const hadTool = Boolean(imageSelection?.apiKey);
    setImageSelection(selection);
    if (selection && hadTool) {
      pushSystemMessage(`🎨 Image generation: ${selection.modelId}`);
    }
  };

  // No full-screen gate: the chat renders immediately (monkey hero + composer)
  // so people can start describing their app right away; the boot bounce is
  // confined to the preview pane while the Snack instance spins up (Stage
  // shows it whenever isClientReady is false).
  const {
    files,
    url,
    connectedClients,
    webPreviewURL,
  } = snackState ?? {};

  const renderChatPanel = () => (
    <ChatPanel
      chat={chat}
      systemMessages={systemMessages}
      generatedImages={generatedImages}
      composerSuggestion={composerSuggestion}
      onMessagesChange={(messages) => {
        if (!currentProjectId) return;
        queueMessagesSave(currentProjectId, messages);
      }}
      currentProvider={selectedProvider?.name}
      currentModel={selectedModel}
      onModelSelect={() => setShowModelSelection(true)}
      onRequireModel={() => {
        setShowModelSelection(true);
        pushSystemMessage('⚠️ Please select an AI model first');
      }}
      isMobile={isMobile}
      projects={projects}
      currentProjectId={currentProjectId}
      onSelectProject={handleSelectProject}
      onCreateProject={() => setIsCreateModalOpen(true)}
      onDeleteProject={(projectId) => {
        void handleDeleteProject(projectId);
      }}
      isExportingProject={isExportingProject}
      onExportProject={handleExportProject}
      onShare={handleShare}
      isSharing={isSharing}
      initialComposerText={initialComposerText}
      onInitialComposerConsumed={() => setInitialComposerText(undefined)}
    />
  );

  const renderStage = () => (
    <Stage
      files={files ?? {}}
      selectedFile={selectedFile}
      onSelectFile={setSelectedFile}
      onUpdateFile={(path, content) => {
        snack?.updateFiles({
          [path]: {
            type: 'CODE',
            contents: content,
          },
        });
        // Mirror the manual edit into the shared agent filesystem so the agent
        // sees the user's changes on its next read (and they survive reload).
        // Debounced so fast typing doesn't write to IndexedDB per keystroke.
        persistFileToAgentFs(path, content);
      }}
      onDeleteFile={(path) => {
        snack?.updateFiles({ [path]: null });
        // Drop any pending debounced write so it can't recreate the file.
        cancelPendingFsWrite(path);
        void agentRef.current?.fs?.delete(path).catch(() => {});
        if (path === selectedFile) {
          setSelectedFile('App.js');
        }
      }}
      webPreviewURL={webPreviewURL}
      onExportProject={handleExportProject}
      isExporting={isExportingProject}
      isClientReady={isClientReady}
      connectedClients={connectedClients}
      url={url}
      dependencies={snackState?.dependencies || {}}
      missingDependencies={snackState?.missingDependencies || {}}
      onAddDependency={(name, version) => {
        snack?.updateDependencies({
          [name]: { version }
        });
        pushSystemMessage(`Adding dependency: ${name}@${version}`);
      }}
      onRemoveDependency={(name) => {
        snack?.updateDependencies({
          [name]: null
        });
        pushSystemMessage(`Removed dependency: ${name}`);
      }}
      sdkVersion={snackState?.sdkVersion}
      webPreviewRef={webPreviewRef}
      mode={stageMode}
      onModeChange={setStageMode}
      appPlatform={mobileTab === 'ios' || mobileTab === 'android' ? mobileTab : undefined}
      isMobile={isMobile}
    />
  );

  return (
    /* dvh, not vh: mobile browsers overreport 100vh while the address bar
       is expanded, which pushed the bottom tab bar below the visible area. */
    <div className="h-dvh w-full bg-background overflow-hidden flex flex-col">
      <CreateProjectModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreate={handleCreateProject}
      />

      <ModelSelectionModal
        isOpen={showModelSelection}
        onClose={() => setShowModelSelection(false)}
        onSelect={handleModelSelection}
        currentProvider={selectedProvider?.id}
        currentModel={selectedModel}
        currentApiKey={apiKey}
        currentCustomUrl={customUrl}
        providerSelections={providerSelections}
        onSelectImage={handleSelectImage}
        currentImage={imageSelection}
      />

      {/* Desktop Layout */}
      {!isMobile && (
        <div className="hidden xl:flex flex-1 overflow-hidden">
          <ResizablePanelGroup direction="horizontal">
            <ResizablePanel defaultSize={35} minSize={25} maxSize={45} className="bg-background border-r z-10">
              {renderChatPanel()}
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel defaultSize={65} minSize={55}>
              {renderStage()}
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      )}

      {/* Mobile Layout */}
      {isMobile && (
        <div className="flex xl:hidden flex-col h-full">
          <div className="flex-1 relative overflow-hidden">
            <div className={cn("absolute inset-x-0 top-0 bottom-0", mobileTab !== 'chat' ? "hidden" : "")}>
              {renderChatPanel()}
            </div>
            <div className={cn("absolute inset-x-0 top-0 bottom-0", mobileTab === 'chat' ? "hidden" : "")}>
              {renderStage()}
            </div>

            {/* Bottom Navigation Bar.
                With Appetize: Chat | Web | iOS | Android | Code (icon-only,
                px-3).
                Without Appetize: Chat | Preview | Code (icon + label, px-4)
                — restores the pre-Appetize layout verbatim. */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center p-1 bg-background/20 backdrop-blur-xl rounded-full border border-white/10 shadow-lg">
              {appetizeEnabled ? (
                <>
                  <button
                    onClick={() => handleMobileTabChange('chat')}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-full text-sm font-medium transition-all",
                      mobileTab === 'chat'
                        ? "bg-background/80 backdrop-blur-md shadow-sm text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <MessageSquare className="h-4 w-4" />
                    <span>Chat</span>
                  </button>
                  <button
                    onClick={() => handleMobileTabChange('web')}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-full text-sm font-medium transition-all",
                      mobileTab === 'web'
                        ? "bg-background/80 backdrop-blur-md shadow-sm text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <WebIcon className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleMobileTabChange('ios')}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-full text-sm font-medium transition-all",
                      mobileTab === 'ios'
                        ? "bg-background/80 backdrop-blur-md shadow-sm text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <AppleIcon className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleMobileTabChange('android')}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-full text-sm font-medium transition-all",
                      mobileTab === 'android'
                        ? "bg-background/80 backdrop-blur-md shadow-sm text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <AndroidIcon className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleMobileTabChange('code')}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-full text-sm font-medium transition-all",
                      mobileTab === 'code'
                        ? "bg-background/80 backdrop-blur-md shadow-sm text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Code2 className="h-4 w-4" />
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => handleMobileTabChange('chat')}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all",
                      mobileTab === 'chat'
                        ? "bg-background/80 backdrop-blur-md shadow-sm text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <MessageSquare className="h-4 w-4" />
                    <span>Chat</span>
                  </button>
                  <button
                    onClick={() => handleMobileTabChange('web')}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all",
                      mobileTab === 'web'
                        ? "bg-background/80 backdrop-blur-md shadow-sm text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Smartphone className="h-4 w-4" />
                    <span>Preview</span>
                  </button>
                  <button
                    onClick={() => handleMobileTabChange('code')}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all",
                      mobileTab === 'code'
                        ? "bg-background/80 backdrop-blur-md shadow-sm text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Code2 className="h-4 w-4" />
                    <span>Code</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
