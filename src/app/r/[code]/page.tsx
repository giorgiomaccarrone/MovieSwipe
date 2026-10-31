import App from "../../App";

export default async function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <App initialCode={code.toUpperCase()} />;
}
