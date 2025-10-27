import { writable } from 'svelte/store';

// Store to track which animations have been completed
// This prevents re-triggering animations on navigation
export const completedAnimations = writable<Set<string>>(new Set());

// Helper function to generate unique animation IDs
export function createAnimationId(componentType: string, value: number, location: string): string {
  return `${componentType}_${value}_${location}`;
}

// Mark an animation as completed
export function markAnimationCompleted(animationId: string) {
  completedAnimations.update(completed => {
    completed.add(animationId);
    return completed;
  });
}

// Check if an animation has been completed
export function isAnimationCompleted(animationId: string): Promise<boolean> {
  return new Promise((resolve) => {
    const unsubscribe = completedAnimations.subscribe(completed => {
      resolve(completed.has(animationId));
      unsubscribe();
    });
  });
}

// Reset all animations (useful for testing or if needed)
export function resetAnimations() {
  completedAnimations.set(new Set());
}