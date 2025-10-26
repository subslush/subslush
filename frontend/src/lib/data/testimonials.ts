export interface Testimonial {
  id: string;
  rating: 5; // Always 5 stars
  quote: string;
  authorName: string; // Format: "Marcus T." (first name + last initial)
  verified: boolean; // Always true
}

export const testimonials: Testimonial[] = [
  {
    id: "1",
    rating: 5,
    quote: "Best decision I made in 2024. Saved over €840 on subscriptions I was already using. Everything works perfectly and setup was instant. Highly recommend!",
    authorName: "Marcus T.",
    verified: true
  },
  {
    id: "2",
    rating: 5,
    quote: "I was skeptical at first but SubSlush delivered exactly as promised. Got my Netflix and Spotify accounts in under 2 minutes. Been using for 6 months with zero issues.",
    authorName: "Sarah L.",
    verified: true
  },
  {
    id: "3",
    rating: 5,
    quote: "Finally found a legit service! Tried other platforms before but SubSlush is the real deal. Customer support is excellent and accounts are verified. Worth every penny.",
    authorName: "James D.",
    verified: true
  }
];