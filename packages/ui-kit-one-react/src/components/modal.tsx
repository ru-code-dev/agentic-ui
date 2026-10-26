import { createComponentImplementation } from "@a2ui/react/v0_9";
import { ModalApi } from "@agentic-ui/ui-kit-one-catalog";
import { useCallback, useState } from "react";
import { ActionScopeContext } from "../action-scope.ts";
import { useKitEnvironment } from "../kit-environment.ts";
import {
  Box,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  Modal as KitModal,
} from "../kit/index.ts";
import { componentMapping, identityProps } from "../mapping.ts";

export const mapping = componentMapping(
  ModalApi,
  [
    "Box (trigger wrapper)",
    "Modal",
    "ModalOverlay",
    "ModalContent",
    "ModalHeader",
    "ModalCloseButton",
    "ModalBody",
  ],
  {
    trigger: { kit: "trigger rendered in place", note: "a click inside it opens the modal" },
    content: { kit: "ModalBody" },
    title: { kit: "ModalHeader", note: "header omitted when there is no title" },
    open: { kit: "Modal isOpen / onClose", note: "two-way when bound; otherwise local state" },
    closeOnAction: {
      kit: "Modal onClose",
      note: "true when omitted: an event action fired inside the content closes it",
    },
  },
);

export const Modal = createComponentImplementation(ModalApi, ({ props, buildChild }) => {
  const { scoped, portalContainer } = useKitEnvironment();
  const [localOpen, setLocalOpen] = useState(false);
  const isBound = props.open !== undefined;
  const isOpen = isBound ? props.open === true : localOpen;
  const setBoundOpen = props.setOpen;
  const setOpen = useCallback(
    (open: boolean) => (isBound ? setBoundOpen(open) : setLocalOpen(open)),
    [isBound, setBoundOpen],
  );
  const closeOnAction = props.closeOnAction ?? true;
  const onContentAction = useCallback(() => {
    if (closeOnAction) setOpen(false);
  }, [closeOnAction, setOpen]);

  return (
    <>
      <Box display="contents" onClick={() => setOpen(true)}>
        {buildChild(props.trigger)}
      </Box>
      <KitModal
        isOpen={isOpen}
        onClose={() => setOpen(false)}
        {...identityProps(KitModal, props, mapping.identityKeys)}
        blockScrollOnMount={!scoped}
        {...(portalContainer === undefined
          ? {}
          : { portalProps: { containerRef: portalContainer } })}
      >
        <ModalOverlay />
        <ModalContent>
          {props.title === undefined ? null : <ModalHeader>{props.title}</ModalHeader>}
          <ModalCloseButton />
          <ModalBody pb={6}>
            <ActionScopeContext.Provider value={onContentAction}>
              {buildChild(props.content)}
            </ActionScopeContext.Provider>
          </ModalBody>
        </ModalContent>
      </KitModal>
    </>
  );
});
