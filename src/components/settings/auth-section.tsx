import { component$, useSignal, $, useVisibleTask$ } from "@builder.io/qwik";
import { authClient } from "~/lib/auth-client";
import { useDiaryxSession } from "~/lib/state/use-diaryx-session";
import { syncNotesWithServer } from "~/lib/sync/note-sync";

export const AuthSection = component$(() => {
  const formState = useSignal<"sign-in" | "sign-up">("sign-in");
  const name = useSignal("");
  const email = useSignal("");
  const password = useSignal("");
  const confirmPassword = useSignal("");
  const isLoading = useSignal(false);
  const errorMessage = useSignal<string | null>(null);
  const successMessage = useSignal<string | null>(null);
  const sessionStore = authClient.useSession;
  const session = useSignal(sessionStore.get());
  const diaryxSession = useDiaryxSession();

  useVisibleTask$(() => {
    session.value = sessionStore.get();
    const unsubscribe = sessionStore.subscribe((value) => {
      session.value = value;
    });
    return () => unsubscribe();
  });

  const resetMessages = () => {
    errorMessage.value = null;
    successMessage.value = null;
  };

  const handleSignUp = $(async () => {
    resetMessages();
    if (!email.value || !password.value || !name.value) {
      errorMessage.value = "Please complete all required fields.";
      return;
    }
    if (password.value.length < 8) {
      errorMessage.value = "Password must be at least 8 characters.";
      return;
    }
    if (password.value !== confirmPassword.value) {
      errorMessage.value = "Passwords do not match.";
      return;
    }
    try {
      isLoading.value = true;
      await authClient.signUp.email(
        {
          email: email.value,
          password: password.value,
          name: name.value,
        },
        {
          onError: (ctx: any) => {
            errorMessage.value = ctx.error?.message ?? "Unable to sign up.";
          },
          onSuccess: async () => {
            name.value = "";
            email.value = "";
            password.value = "";
            confirmPassword.value = "";
            try {
              await syncNotesWithServer(diaryxSession);
              successMessage.value = "Account created! Notes synced.";
            } catch (error) {
              errorMessage.value =
                error instanceof Error ? error.message : "Unable to sync notes.";
            }
          },
        } as any
      );
    } catch (error) {
      if (!errorMessage.value) {
        errorMessage.value = error instanceof Error ? error.message : "Unable to sign up.";
      }
    } finally {
      isLoading.value = false;
    }
  });

  const handleSignIn = $(async () => {
    resetMessages();
    if (!email.value || !password.value) {
      errorMessage.value = "Email and password are required.";
      return;
    }
    try {
      isLoading.value = true;
      await authClient.signIn.email(
        {
          email: email.value,
          password: password.value,
        },
        {
          onError: (ctx: any) => {
            errorMessage.value = ctx.error?.message ?? "Invalid credentials.";
          },
          onSuccess: async () => {
            password.value = "";
            try {
              await syncNotesWithServer(diaryxSession);
              successMessage.value = "Signed in and synced.";
            } catch (error) {
              errorMessage.value =
                error instanceof Error ? error.message : "Unable to sync notes.";
            }
          },
        } as any
      );
    } catch (error) {
      if (!errorMessage.value) {
        errorMessage.value = error instanceof Error ? error.message : "Unable to sign in.";
      }
    } finally {
      isLoading.value = false;
    }
  });

  const handleSignOut = $(async () => {
    resetMessages();
    isLoading.value = true;
    try {
      await authClient.signOut(undefined, {
        onError: (ctx: any) => {
          errorMessage.value = ctx.error?.message ?? "Unable to sign out.";
        },
        onSuccess: () => {
          successMessage.value = "Signed out.";
        },
      } as any);
    } catch (error) {
      if (!errorMessage.value) {
        errorMessage.value = error instanceof Error ? error.message : "Unable to sign out.";
      }
    } finally {
      isLoading.value = false;
    }
  });

  const currentSession = session.value;

  if (currentSession?.data?.user) {
    const user = currentSession.data.user;
    return (
      <div class="auth-card">
        <header>
          <h4>Signed in</h4>
          <p>{user.email}</p>
        </header>
        <dl class="user-info">
          {user.name && (
            <div>
              <dt>Name</dt>
              <dd>{user.name}</dd>
            </div>
          )}
          <div>
            <dt>Email verified</dt>
            <dd>{user.emailVerified ? "Yes" : "No"}</dd>
          </div>
          <div>
            <dt>Account created</dt>
            <dd>{new Date(user.createdAt).toLocaleString()}</dd>
          </div>
        </dl>
        {errorMessage.value && <p class="status error">{errorMessage.value}</p>}
        {successMessage.value && <p class="status success">{successMessage.value}</p>}
        <button type="button" onClick$={handleSignOut} disabled={isLoading.value}>
          {isLoading.value ? "Signing out…" : "Sign out"}
        </button>
      </div>
    );
  }

  return (
    <div class="auth-card">
      <header>
        <nav class="auth-tabs" aria-label="Authentication mode">
          <button
            type="button"
            class={{ active: formState.value === "sign-in" }}
            onClick$={() => {
              formState.value = "sign-in";
              resetMessages();
            }}
            disabled={isLoading.value && formState.value === "sign-in"}
          >
            Sign In
          </button>
          <button
            type="button"
            class={{ active: formState.value === "sign-up" }}
            onClick$={() => {
              formState.value = "sign-up";
              resetMessages();
            }}
            disabled={isLoading.value && formState.value === "sign-up"}
          >
            Register
          </button>
        </nav>
        <p>
          {formState.value === "sign-in"
            ? "Sign in to sync your notes and access them anywhere."
            : "Create an account to sync notes across devices."}
        </p>
      </header>

      <form
        class="auth-form"
        preventdefault:submit
        onSubmit$={formState.value === "sign-in" ? handleSignIn : handleSignUp}
      >
        {formState.value === "sign-up" && (
          <label>
            <span>Name</span>
            <input
              type="text"
              autocomplete="name"
              value={name.value}
              onInput$={(event) => (name.value = (event.target as HTMLInputElement).value)}
              required
            />
          </label>
        )}
        <label>
          <span>Email</span>
          <input
            type="email"
            autocomplete="email"
            value={email.value}
            onInput$={(event) => (email.value = (event.target as HTMLInputElement).value)}
            required
          />
        </label>
        <label>
          <span>Password</span>
          <input
            type="password"
            autocomplete={formState.value === "sign-in" ? "current-password" : "new-password"}
            value={password.value}
            onInput$={(event) => (password.value = (event.target as HTMLInputElement).value)}
            required
          />
        </label>
        {formState.value === "sign-up" && (
          <label>
            <span>Confirm password</span>
            <input
              type="password"
              autocomplete="new-password"
              value={confirmPassword.value}
              onInput$={(event) => (confirmPassword.value = (event.target as HTMLInputElement).value)}
              required
            />
          </label>
        )}

        {errorMessage.value && <p class="status error">{errorMessage.value}</p>}
        {successMessage.value && <p class="status success">{successMessage.value}</p>}

        <button type="submit" disabled={isLoading.value}>
          {isLoading.value
            ? formState.value === "sign-in"
              ? "Signing in…"
              : "Creating account…"
            : formState.value === "sign-in"
              ? "Sign In"
              : "Register"}
        </button>
      </form>
    </div>
  );
});
