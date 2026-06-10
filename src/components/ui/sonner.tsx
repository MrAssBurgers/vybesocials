import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      position="top-center"
      className="toaster group"
      style={{ zIndex: 99998 }}
      offset={{ top: 'calc(var(--sat, 0px) + 12px)' }}
      mobileOffset={{ top: 'calc(var(--sat, 0px) + 12px)' }}
      swipeDirections={["top"]}
      toastOptions={{
        classNames: {
          toast:
            "group toast-pill z-[99998]",
          title: "toast-pill-title",
          description: "toast-pill-description",
          actionButton: "toast-pill-action",
          cancelButton: "toast-pill-cancel",
          success: "toast-pill-success",
          error: "toast-pill-error",
          warning: "toast-pill-warning",
          info: "toast-pill-info",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
