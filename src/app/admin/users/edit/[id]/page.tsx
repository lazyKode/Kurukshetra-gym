import EditMemberPage from "./edit-member-page";

// The static (GitHub Pages) build needs at least one concrete path for this
// dynamic route. Real member IDs are resolved in the browser (see use-route-id).
export function generateStaticParams() {
  return [{ id: "_" }];
}

export default function Page() {
  return <EditMemberPage />;
}
