import { Redirect } from 'expo-router';

/** Unknown deep links (including acks, which are only meant for the counter device) go home. */
export default function NotFound() {
  return <Redirect href="/" />;
}
