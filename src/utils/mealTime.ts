export type Meal = "아침" | "점심" | "저녁" | "간식";

/** Use the device's local clock; the user can always change this suggestion. */
export function mealForTime(date = new Date()): Meal {
  const hour = date.getHours();
  if (hour >= 5 && hour < 11) return "아침";
  if (hour >= 11 && hour < 17) return "점심";
  if (hour >= 17 && hour < 22) return "저녁";
  return "간식";
}
