type Props = {
  html: string | undefined;
};

export function InstanceBrandingSlot({ html }: Props) {
  if (!html) {
    return null;
  }

  return (
    <div
      className="xrdb-instance-slot"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
