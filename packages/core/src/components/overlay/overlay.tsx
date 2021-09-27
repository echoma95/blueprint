/*
 * Copyright 2015 Palantir Technologies, Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import classNames from "classnames";
import React, { cloneElement, createRef } from "react";
import { CSSTransition, TransitionGroup } from "react-transition-group";

import { AbstractPureComponent, Classes, Keys } from "../../common";
import { DISPLAYNAME_PREFIX, Props } from "../../common/props";
import { isFunction } from "../../common/utils";
import { Portal } from "../portal/portal";

export interface OverlayableProps extends OverlayLifecycleProps {
    /**
     * Whether the overlay should acquire application focus when it first opens.
     *
     * @default true
     */
    autoFocus?: boolean;

    /**
     * Whether pressing the `esc` key should invoke `onClose`.
     *
     * @default true
     */
    canEscapeKeyClose?: boolean;

    /**
     * Whether the overlay should prevent focus from leaving itself. That is, if the user attempts
     * to focus an element outside the overlay and this prop is enabled, then the overlay will
     * immediately bring focus back to itself. If you are nesting overlay components, either disable
     * this prop on the "outermost" overlays or mark the nested ones `usePortal={false}`.
     *
     * @default true
     */
    enforceFocus?: boolean;

    /**
     * If `true` and `usePortal={true}`, the `Portal` containing the children is created and attached
     * to the DOM when the overlay is opened for the first time; otherwise this happens when the
     * component mounts. Lazy mounting provides noticeable performance improvements if you have lots
     * of overlays at once, such as on each row of a table.
     *
     * @default true
     */
    lazy?: boolean;

    /**
     * Whether the application should return focus to the last active element in the
     * document after this overlay closes.
     *
     * @default true
     */
    shouldReturnFocusOnClose?: boolean;

    /**
     * Indicates how long (in milliseconds) the overlay's enter/leave transition takes.
     * This is used by React `CSSTransition` to know when a transition completes and must match
     * the duration of the animation in CSS. Only set this prop if you override Blueprint's default
     * transitions with new transitions of a different length.
     *
     * @default 300
     */
    transitionDuration?: number;

    /**
     * Whether the overlay should be wrapped in a `Portal`, which renders its contents in a new
     * element attached to `portalContainer` prop.
     *
     * This prop essentially determines which element is covered by the backdrop: if `false`,
     * then only its parent is covered; otherwise, the entire page is covered (because the parent
     * of the `Portal` is the `<body>` itself).
     *
     * Set this prop to `false` on nested overlays (such as `Dialog` or `Popover`) to ensure that they
     * are rendered above their parents.
     *
     * @default true
     */
    usePortal?: boolean;

    /**
     * Space-delimited string of class names applied to the `Portal` element if
     * `usePortal={true}`.
     */
    portalClassName?: string;

    /**
     * The container element into which the overlay renders its contents, when `usePortal` is `true`.
     * This prop is ignored if `usePortal` is `false`.
     *
     * @default document.body
     */
    portalContainer?: HTMLElement;

    /**
     * A callback that is invoked when user interaction causes the overlay to close, such as
     * clicking on the overlay or pressing the `esc` key (if enabled).
     *
     * Receives the event from the user's interaction, if there was an event (generally either a
     * mouse or key event). Note that, since this component is controlled by the `isOpen` prop, it
     * will not actually close itself until that prop becomes `false`.
     */
    onClose?: (event: React.SyntheticEvent<HTMLElement>) => void;
}

export interface OverlayLifecycleProps {
    /**
     * Lifecycle method invoked just before the CSS _close_ transition begins on
     * a child. Receives the DOM element of the child being closed.
     */
    onClosing?: (node: HTMLElement) => void;

    /**
     * Lifecycle method invoked just after the CSS _close_ transition ends but
     * before the child has been removed from the DOM. Receives the DOM element
     * of the child being closed.
     */
    onClosed?: (node: HTMLElement) => void;

    /**
     * Lifecycle method invoked just after mounting the child in the DOM but
     * just before the CSS _open_ transition begins. Receives the DOM element of
     * the child being opened.
     */
    onOpening?: (node: HTMLElement) => void;

    /**
     * Lifecycle method invoked just after the CSS _open_ transition ends.
     * Receives the DOM element of the child being opened.
     */
    onOpened?: (node: HTMLElement) => void;
}

export interface BackdropProps {
    /** CSS class names to apply to backdrop element. */
    backdropClassName?: string;

    /** HTML props for the backdrop element. */
    backdropProps?: React.HTMLProps<HTMLDivElement>;

    /**
     * Whether clicking outside the overlay element (either on backdrop when present or on document)
     * should invoke `onClose`.
     *
     * @default true
     */
    canOutsideClickClose?: boolean;

    /**
     * Whether a container-spanning backdrop element should be rendered behind the contents.
     *
     * @default true
     */
    hasBackdrop?: boolean;
}

export interface OverlayProps extends OverlayableProps, BackdropProps, Props {
    /**
     * Toggles the visibility of the overlay and its children.
     * This prop is required because the component is controlled.
     */
    isOpen: boolean;

    /**
     * Name of the transition for internal `CSSTransition`.
     * Providing your own name here will require defining new CSS transition properties.
     *
     * @default Classes.OVERLAY
     */
    transitionName?: string;
}

export interface OverlayState {
    hasEverOpened?: boolean;
}

export class Overlay extends AbstractPureComponent<OverlayProps, OverlayState> {
    public static displayName = `${DISPLAYNAME_PREFIX}.Overlay`;

    public static defaultProps: OverlayProps = {
        autoFocus: true,
        backdropProps: {},
        canEscapeKeyClose: true,
        canOutsideClickClose: true,
        enforceFocus: true,
        hasBackdrop: true,
        isOpen: false,
        lazy: true,
        shouldReturnFocusOnClose: true,
        transitionDuration: 300,
        transitionName: Classes.OVERLAY,
        usePortal: true,
    };

    public static getDerivedStateFromProps({ isOpen: hasEverOpened }: OverlayProps) {
        if (hasEverOpened) {
            return { hasEverOpened };
        }
        return null;
    }

    private static openStack: Overlay[] = [];

    private static getLastOpened = () => Overlay.openStack[Overlay.openStack.length - 1];

    private lastActiveElementBeforeOpened: Element | null | undefined;

    public state: OverlayState = {
        hasEverOpened: this.props.isOpen,
    };

    /** Ref for container element, containing all children and the backdrop */
    public containerElement = createRef<HTMLDivElement>();

    // An empty, keyboard-focusable div at the beginning of the Overlay content
    private startFocusTrapElement = createRef<HTMLDivElement>();

    // An empty, keyboard-focusable div at the end of the Overlay content
    private endFocusTrapElement = createRef<HTMLDivElement>();

    public render() {
        // oh snap! no reason to render anything at all if we're being truly lazy
        if (this.props.lazy && !this.state.hasEverOpened) {
            return null;
        }

        const { children, className, enforceFocus, usePortal, isOpen } = this.props;

        // TransitionGroup types require single array of children; does not support nested arrays.
        // So we must collapse backdrop and children into one array, and every item must be wrapped in a
        // Transition element (no ReactText allowed).
        const childrenWithTransitions = isOpen ? React.Children.map(children, this.maybeRenderChild) ?? [] : [];

        const maybeBackdrop = this.maybeRenderBackdrop();
        if (maybeBackdrop !== null) {
            childrenWithTransitions.unshift(maybeBackdrop);
        }
        if (isOpen && enforceFocus && childrenWithTransitions.length > 0) {
            childrenWithTransitions.unshift(this.renderDummyElement("__first", { onFocus: this.handleStartFocusTrapElementFocusIn, ref: this.startFocusTrapElement }));
            childrenWithTransitions.push(this.renderDummyElement("__last", { onFocus: this.handleEndFocusTrapElementFocusIn, ref: this.endFocusTrapElement }));
        }

        const containerClasses = classNames(
            Classes.OVERLAY,
            {
                [Classes.OVERLAY_OPEN]: isOpen,
                [Classes.OVERLAY_INLINE]: !usePortal,
            },
            className,
        );

        const transitionGroup = (
            <div aria-live="polite" className={containerClasses} onKeyDown={this.handleKeyDown} ref={this.containerElement}>
                <TransitionGroup appear={true} component={null}>
                    {childrenWithTransitions}
                </TransitionGroup>
            </div>
        );
        if (usePortal) {
            return (
                <Portal className={this.props.portalClassName} container={this.props.portalContainer}>
                    {transitionGroup}
                </Portal>
            );
        } else {
            return transitionGroup;
        }
    }

    public componentDidMount() {
        if (this.props.isOpen) {
            this.overlayWillOpen();
        }
    }

    public componentDidUpdate(prevProps: OverlayProps) {
        if (prevProps.isOpen && !this.props.isOpen) {
            this.overlayWillClose();
        } else if (!prevProps.isOpen && this.props.isOpen) {
            this.overlayWillOpen();
        }
    }

    public componentWillUnmount() {
        this.overlayWillClose();
    }

    /**
     * @public for testing
     * @internal
     */
    public bringFocusInsideOverlay() {
        // always delay focus manipulation to just before repaint to prevent scroll jumping
        return this.requestAnimationFrame(() => {
            // container element may be undefined between component mounting and Portal rendering
            // activeElement may be undefined in some rare cases in IE
            if (this.containerElement.current == null || document.activeElement == null || !this.props.isOpen) {
                return;
            }

            const container = this.containerElement.current;
            const isFocusOutsideModal = !container.contains(document.activeElement);
            if (isFocusOutsideModal) {
                // element marked autofocus has higher priority than other attributes
                const autofocusElement = container.querySelector<HTMLElement>("[autofocus]");
                const firstKeyboardFocusableElement = this.getKeyboardFocusableElements().shift();
                if (autofocusElement != null) {
                    autofocusElement.focus();
                } else if (firstKeyboardFocusableElement != null) {
                    firstKeyboardFocusableElement.focus();
                } else {
                    this.startFocusTrapElement.current?.focus();
                }
            }
        });
    }

    private maybeRenderChild = (child?: React.ReactNode) => {
        if (isFunction(child)) {
            child = child();
        }

        if (child == null) {
            return null;
        }

        // decorate the child with a few injected props
        const tabIndex = this.props.enforceFocus || this.props.autoFocus ? 0 : undefined;
        const decoratedChild =
            typeof child === "object" ? (
                cloneElement(child as React.ReactElement, {
                    className: classNames((child as React.ReactElement).props.className, Classes.OVERLAY_CONTENT),
                    tabIndex,
                })
            ) : (
                <span className={Classes.OVERLAY_CONTENT} tabIndex={tabIndex}>
                    {child}
                </span>
            );

        const { onOpening, onOpened, onClosing, transitionDuration, transitionName } = this.props;

        return (
            <CSSTransition
                classNames={transitionName}
                onEntering={onOpening}
                onEntered={onOpened}
                onExiting={onClosing}
                onExited={this.handleTransitionExited}
                timeout={transitionDuration}
                addEndListener={this.handleTransitionAddEnd}
            >
                {decoratedChild}
            </CSSTransition>
        );
    };

    private maybeRenderBackdrop() {
        const {
            backdropClassName,
            backdropProps,
            hasBackdrop,
            isOpen,
            transitionDuration,
            transitionName,
        } = this.props;

        if (hasBackdrop && isOpen) {
            return (
                <CSSTransition
                    classNames={transitionName}
                    key="__backdrop"
                    timeout={transitionDuration}
                    addEndListener={this.handleTransitionAddEnd}
                >
                    <div
                        {...backdropProps}
                        className={classNames(Classes.OVERLAY_BACKDROP, backdropClassName, backdropProps?.className)}
                        onMouseDown={this.handleBackdropMouseDown}
                    />
                </CSSTransition>
            );
        } else {
            return null;
        }
    }

    private renderDummyElement(key: string, divProps: Partial<React.HTMLProps<HTMLDivElement>>) {
        const { transitionDuration, transitionName } = this.props;
        return (
            <CSSTransition
                classNames={transitionName}
                key={key}
                addEndListener={this.handleTransitionAddEnd}
                timeout={transitionDuration}
                unmountOnExit={true}
            >
                <div tabIndex={0} {...divProps} />
            </CSSTransition>
        );
    }

    /**
     * Ensures repeatedly pressing shift+tab keeps focus inside the Overlay. Moves focus to
     * the `endFocusTrapElement` or the first keyboard-focusable element in the Overlay (excluding
     * the `startFocusTrapElement`), depending on whether the element losing focus is inside the
     * Overlay.
     */
    private handleStartFocusTrapElementFocusIn = (e: React.FocusEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        if (
            e.relatedTarget != null &&
            this.containerElement.current?.contains(e.relatedTarget as Element) &&
            e.relatedTarget !== this.endFocusTrapElement.current
        ) {
            this.endFocusTrapElement.current?.focus();
        } else {
            this.getKeyboardFocusableElements().shift()?.focus();
        }
    };

    /**
     * Ensures repeatedly pressing tab keeps focus inside the Overlay. Moves focus to the
     * `startFocusTrapElement` or the last keyboard-focusable element in the Overlay (excluding the
     * `startFocusTrapElement`), depending on whether the element losing focus is inside the
     * Overlay.
     */
    private handleEndFocusTrapElementFocusIn = (e: React.FocusEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        if (
            e.relatedTarget != null &&
            this.containerElement.current?.contains(e.relatedTarget as Element) &&
            e.relatedTarget !== this.startFocusTrapElement.current
        ) {
            this.startFocusTrapElement.current?.focus();
        } else {
            const nextFocusableElement = this.getKeyboardFocusableElements().pop();
            if (nextFocusableElement != null) {
                nextFocusableElement.focus();
            } else {
                // Keeps focus within Overlay even if there are no keyboard-focusable children
                this.startFocusTrapElement.current?.focus();
            }
        }
    };

    private getKeyboardFocusableElements() {
        const focusableElements: HTMLElement[] =
            this.containerElement.current !== null
                ? Array.from(
                      // Order may not be correct if children elements use tabindex values > 0.
                      // Selectors derived from this SO question:
                      // https://stackoverflow.com/questions/1599660/which-html-elements-can-receive-focus
                      this.containerElement.current.querySelectorAll(
                          [
                              'a[href]:not([tabindex="-1"])',
                              'button:not([disabled]):not([tabindex="-1"])',
                              'details:not([tabindex="-1"])',
                              'input:not([disabled]):not([tabindex="-1"])',
                              'select:not([disabled]):not([tabindex="-1"])',
                              'textarea:not([disabled]):not([tabindex="-1"])',
                              '[tabindex]:not([tabindex="-1"])',
                          ].join(","),
                      ),
                  )
                : [];
        if (this.props.enforceFocus) {
            // The first and last elements are dummy elements that help trap focus when enforceFocus
            // is enabled
            focusableElements.shift();
            focusableElements.pop();
        }
        return focusableElements;
    }

    private overlayWillClose() {
        document.removeEventListener("focus", this.handleDocumentFocus, /* useCapture */ true);
        document.removeEventListener("mousedown", this.handleDocumentClick);

        const { openStack } = Overlay;
        const stackIndex = openStack.indexOf(this);
        if (stackIndex !== -1) {
            openStack.splice(stackIndex, 1);
            if (openStack.length > 0) {
                const lastOpenedOverlay = Overlay.getLastOpened();
                if (lastOpenedOverlay.props.enforceFocus) {
                    lastOpenedOverlay.bringFocusInsideOverlay();
                    document.addEventListener("focus", lastOpenedOverlay.handleDocumentFocus, /* useCapture */ true);
                }
            }

            if (openStack.filter(o => o.props.usePortal && o.props.hasBackdrop).length === 0) {
                document.body.classList.remove(Classes.OVERLAY_OPEN);
            }
        }
    }

    private overlayWillOpen() {
        const { getLastOpened, openStack } = Overlay;
        if (openStack.length > 0) {
            document.removeEventListener("focus", getLastOpened().handleDocumentFocus, /* useCapture */ true);
        }
        openStack.push(this);

        if (this.props.autoFocus) {
            this.bringFocusInsideOverlay();
        }

        if (this.props.enforceFocus) {
            // Focus events do not bubble, but setting useCapture allows us to listen in and execute
            // our handler before all others
            document.addEventListener("focus", this.handleDocumentFocus, /* useCapture */ true);
        }

        if (this.props.canOutsideClickClose && !this.props.hasBackdrop) {
            document.addEventListener("mousedown", this.handleDocumentClick);
        }

        if (this.props.hasBackdrop && this.props.usePortal) {
            // add a class to the body to prevent scrolling of content below the overlay
            document.body.classList.add(Classes.OVERLAY_OPEN);
        }

        this.lastActiveElementBeforeOpened = document.activeElement;
    }

    private handleTransitionExited = (node: HTMLElement) => {
        if (this.props.shouldReturnFocusOnClose && this.lastActiveElementBeforeOpened instanceof HTMLElement) {
            this.lastActiveElementBeforeOpened.focus();
        }
        this.props.onClosed?.(node);
    };

    private handleBackdropMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        const { backdropProps, canOutsideClickClose, enforceFocus, onClose } = this.props;
        if (canOutsideClickClose) {
            onClose?.(e);
        }
        if (enforceFocus) {
            this.bringFocusInsideOverlay();
        }
        backdropProps?.onMouseDown?.(e);
    };

    private handleDocumentClick = (e: MouseEvent) => {
        const { canOutsideClickClose, isOpen, onClose } = this.props;
        // get the actual target even in the Shadow DOM
        // see https://github.com/palantir/blueprint/issues/4220
        const eventTarget = (e.composed ? e.composedPath()[0] : e.target) as HTMLElement;

        const stackIndex = Overlay.openStack.indexOf(this);
        const isClickInThisOverlayOrDescendant = Overlay.openStack
            .slice(stackIndex)
            .some(({ containerElement: elem }) => {
                // `elem` is the container of backdrop & content, so clicking directly on that container
                // should not count as being "inside" the overlay.
                return elem.current?.contains(eventTarget) && !elem.current.isSameNode(eventTarget);
            });

        if (isOpen && !isClickInThisOverlayOrDescendant && canOutsideClickClose) {
            // casting to any because this is a native event
            onClose?.(e as any);
        }
    };

    /**
     * When multiple Overlays are open, this event handler is only active for the most recently
     * opened one to avoid Overlays competing with each other for focus.
     */
    private handleDocumentFocus = (e: FocusEvent) => {
        // get the actual target even in the Shadow DOM
        // see https://github.com/palantir/blueprint/issues/4220
        const eventTarget = e.composed ? e.composedPath()[0] : e.target;
        if (
            this.props.enforceFocus &&
            this.containerElement.current != null &&
            eventTarget instanceof Node &&
            !this.containerElement.current.contains(eventTarget as HTMLElement)
        ) {
            // prevent default focus behavior (sometimes auto-scrolls the page)
            e.preventDefault();
            e.stopImmediatePropagation();
            this.bringFocusInsideOverlay();
        }
    };

    private handleKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
        const { canEscapeKeyClose, onClose } = this.props;
        // HACKHACK: https://github.com/palantir/blueprint/issues/4165
        /* eslint-disable-next-line deprecation/deprecation */
        if (e.which === Keys.ESCAPE && canEscapeKeyClose) {
            onClose?.(e);
            // prevent browser-specific escape key behavior (Safari exits fullscreen)
            e.preventDefault();
        }
    };

    private handleTransitionAddEnd = () => {
        // no-op
    };
}
