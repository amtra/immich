<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { focusTrap } from '$lib/actions/focus-trap';
  import { scrollMemory } from '$lib/actions/scroll-memory';
  import Icon from '$lib/components/elements/icon.svelte';
  import ManagePeopleVisibility from '$lib/components/faces-page/manage-people-visibility.svelte';
  import MergeSuggestionModal from '$lib/components/faces-page/merge-suggestion-modal.svelte';
  import PeopleCard from '$lib/components/faces-page/people-card.svelte';
  import PeopleInfiniteScroll from '$lib/components/faces-page/people-infinite-scroll.svelte';
  import SearchPeople from '$lib/components/faces-page/people-search.svelte';
  import SetBirthDateModal from '$lib/components/faces-page/set-birth-date-modal.svelte';
  import UserPageLayout from '$lib/components/layouts/user-page-layout.svelte';
  import FullScreenModal from '$lib/components/shared-components/full-screen-modal.svelte';
  import {
    notificationController,
    NotificationType,
  } from '$lib/components/shared-components/notification/notification';
  import { ActionQueryParameterValue, AppRoute, QueryParameter, SessionStorageKey } from '$lib/constants';
  import { locale } from '$lib/stores/preferences.store';
  import { websocketEvents } from '$lib/stores/websocket';
  import { handlePromiseError } from '$lib/utils';
  import { handleError } from '$lib/utils/handle-error';
  import { clearQueryParam } from '$lib/utils/navigation';
  import {
    getAllPeople,
    getPerson,
    mergePerson,
    searchPerson,
    updatePerson,
    type PersonResponseDto,
  } from '@immich/sdk';
  import { Button } from '@immich/ui';
  import { mdiAccountOff, mdiEyeOutline } from '@mdi/js';
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import { quintOut } from 'svelte/easing';
  import { fly } from 'svelte/transition';
  import type { PageData } from './$types';

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  let selectHidden = $state(false);
  let searchName = $state('');
  let showChangeNameModal = $state(false);
  let showSetBirthDateModal = $state(false);
  let showMergeModal = $state(false);
  let personName = $state('');
  let currentPage = $state(1);
  let nextPage = $state(data.people.hasNextPage ? 2 : null);
  let personMerge1 = $state<PersonResponseDto>();
  let personMerge2 = $state<PersonResponseDto>();
  let potentialMergePeople: PersonResponseDto[] = $state([]);
  let edittingPerson: PersonResponseDto | null = $state(null);
  let searchedPeopleLocal: PersonResponseDto[] = $state([]);
  // let handleSearchPeople: (force?: boolean, name?: string) => Promise<void> = $state();
  let changeNameInputEl = $state<HTMLInputElement>();
  let innerHeight = $state(0);
  let searchPeopleElement = $state<ReturnType<typeof SearchPeople>>();
  onMount(() => {
    const getSearchedPeople = $page.url.searchParams.get(QueryParameter.SEARCHED_PEOPLE);
    if (getSearchedPeople) {
      searchName = getSearchedPeople;
      if (searchPeopleElement) {
        handlePromiseError(searchPeopleElement.searchPeople(true, searchName));
      }
    }

    return websocketEvents.on('on_person_thumbnail', (personId: string) => {
      for (const person of people) {
        if (person.id === personId) {
          person.updatedAt = new Date().toISOString();
        }
      }
    });
  });

  const loadInitialScroll = () =>
    new Promise<void>((resolve) => {
      // Load up to previously loaded page when returning.
      let newNextPage = sessionStorage.getItem(SessionStorageKey.INFINITE_SCROLL_PAGE);
      if (newNextPage && nextPage) {
        let startingPage = nextPage,
          pagesToLoad = Number.parseInt(newNextPage) - nextPage;

        if (pagesToLoad) {
          handlePromiseError(
            Promise.all(
              Array.from({ length: pagesToLoad }).map((_, i) => {
                return getAllPeople({ withHidden: true, page: startingPage + i });
              }),
            ).then((pages) => {
              for (const page of pages) {
                people = people.concat(page.people);
              }
              currentPage = startingPage + pagesToLoad - 1;
              nextPage = pages.at(-1)?.hasNextPage ? startingPage + pagesToLoad : null;
              resolve(); // wait until extra pages are loaded
            }),
          );
        } else {
          resolve();
        }
        sessionStorage.removeItem(SessionStorageKey.INFINITE_SCROLL_PAGE);
      }
    });

  const loadNextPage = async () => {
    if (!nextPage) {
      return;
    }

    try {
      const { people: newPeople, hasNextPage } = await getAllPeople({ withHidden: true, page: nextPage });
      people = people.concat(newPeople);
      if (nextPage !== null) {
        currentPage = nextPage;
      }
      nextPage = hasNextPage ? nextPage + 1 : null;
    } catch (error) {
      handleError(error, $t('errors.failed_to_load_people'));
    }
  };

  const handleSearch = async () => {
    const getSearchedPeople = $page.url.searchParams.get(QueryParameter.SEARCHED_PEOPLE);
    if (getSearchedPeople !== searchName) {
      $page.url.searchParams.set(QueryParameter.SEARCHED_PEOPLE, searchName);
      await goto($page.url, { keepFocus: true });
    }
  };

  const handleMergeSamePerson = async (response: [PersonResponseDto, PersonResponseDto]) => {
    const [personToMerge, personToBeMergedIn] = response;
    showMergeModal = false;

    if (!edittingPerson) {
      return;
    }
    try {
      await mergePerson({
        id: personToBeMergedIn.id,
        mergePersonDto: { ids: [personToMerge.id] },
      });

      const mergedPerson = await getPerson({ id: personToBeMergedIn.id });

      people = people.filter((person: PersonResponseDto) => person.id !== personToMerge.id);
      people = people.map((person: PersonResponseDto) => (person.id === personToBeMergedIn.id ? mergedPerson : person));
      notificationController.show({
        message: $t('merge_people_successfully'),
        type: NotificationType.Info,
      });
    } catch (error) {
      handleError(error, $t('errors.unable_to_save_name'));
    }
    if (personToBeMergedIn.name !== personName && edittingPerson.id === personToBeMergedIn.id) {
      /*
       *
       * If the user merges one of the suggested people into the person he's editing it, it's merging the suggested person AND renames
       * the person he's editing
       *
       */
      try {
        await updatePerson({ id: personToBeMergedIn.id, personUpdateDto: { name: personName } });

        for (const person of people) {
          if (person.id === personToBeMergedIn.id) {
            person.name = personName;
            break;
          }
        }
        notificationController.show({
          message: $t('change_name_successfully'),
          type: NotificationType.Info,
        });
      } catch (error) {
        handleError(error, $t('errors.unable_to_save_name'));
      }
    }
  };

  const handleChangeName = (detail: PersonResponseDto) => {
    showChangeNameModal = true;
    personName = detail.name;
    personMerge1 = detail;
    edittingPerson = detail;

    setTimeout(() => changeNameInputEl?.focus(), 100);
  };

  const handleSetBirthDate = (detail: PersonResponseDto) => {
    showSetBirthDateModal = true;
    edittingPerson = detail;
  };

  const handleHidePerson = async (detail: PersonResponseDto) => {
    try {
      const updatedPerson = await updatePerson({
        id: detail.id,
        personUpdateDto: { isHidden: true },
      });

      people = people.map((person: PersonResponseDto) => {
        if (person.id === updatedPerson.id) {
          return updatedPerson;
        }
        return person;
      });

      showChangeNameModal = false;
      notificationController.show({
        message: $t('changed_visibility_successfully'),
        type: NotificationType.Info,
      });
    } catch (error) {
      handleError(error, $t('errors.unable_to_hide_person'));
    }
  };

  const handleToggleFavorite = async (detail: PersonResponseDto) => {
    try {
      const updatedPerson = await updatePerson({
        id: detail.id,
        personUpdateDto: { isFavorite: !detail.isFavorite },
      });

      const index = people.findIndex((person) => person.id === detail.id);
      people[index] = updatedPerson;

      notificationController.show({
        message: updatedPerson.isFavorite ? $t('added_to_favorites') : $t('removed_from_favorites'),
        type: NotificationType.Info,
      });
    } catch (error) {
      handleError(error, $t('errors.unable_to_add_remove_favorites', { values: { favorite: detail.isFavorite } }));
    }
  };

  const handleMergePeople = async (detail: PersonResponseDto) => {
    await goto(
      `${AppRoute.PEOPLE}/${detail.id}?${QueryParameter.ACTION}=${ActionQueryParameterValue.MERGE}&${QueryParameter.PREVIOUS_ROUTE}=${AppRoute.PEOPLE}`,
    );
  };

  const submitNameChange = async (event: Event) => {
    event.preventDefault();

    potentialMergePeople = [];
    showChangeNameModal = false;
    if (!edittingPerson || personName === edittingPerson.name) {
      return;
    }
    if (personName === '') {
      await changeName();
      return;
    }
    const data = await searchPerson({ name: personName, withHidden: true });

    // We check if another person has the same name as the name entered by the user

    const existingPerson = data.find(
      (person: PersonResponseDto) =>
        person.name.toLowerCase() === personName.toLowerCase() &&
        edittingPerson &&
        person.id !== edittingPerson.id &&
        person.name,
    );
    if (existingPerson) {
      personMerge2 = existingPerson;
      showMergeModal = true;
      potentialMergePeople = people
        .filter(
          (person: PersonResponseDto) =>
            personMerge2?.name.toLowerCase() === person.name.toLowerCase() &&
            person.id !== personMerge2.id &&
            person.id !== personMerge1?.id &&
            !person.isHidden,
        )
        .slice(0, 3);
      return;
    }
    await changeName();
  };

  const submitBirthDateChange = async (value: string) => {
    showSetBirthDateModal = false;
    if (!edittingPerson || value === edittingPerson.birthDate) {
      return;
    }

    try {
      const updatedPerson = await updatePerson({
        id: edittingPerson.id,
        personUpdateDto: { birthDate: value.length > 0 ? value : null },
      });

      people = people.map((person: PersonResponseDto) => {
        if (person.id === updatedPerson.id) {
          return updatedPerson;
        }
        return person;
      });
      notificationController.show({
        message: $t('birthdate_saved'),
        type: NotificationType.Info,
      });
    } catch (error) {
      handleError(error, $t('errors.unable_to_save_name'));
    }
  };

  const changeName = async () => {
    showMergeModal = false;
    showChangeNameModal = false;

    if (!edittingPerson) {
      return;
    }
    try {
      const updatedPerson = await updatePerson({
        id: edittingPerson.id,
        personUpdateDto: { name: personName },
      });
      people = people.map((person: PersonResponseDto) => {
        if (person.id === updatedPerson.id) {
          return updatedPerson;
        }
        return person;
      });
      notificationController.show({
        message: $t('change_name_successfully'),
        type: NotificationType.Info,
      });
    } catch (error) {
      handleError(error, $t('errors.unable_to_save_name'));
    }
  };

  const onResetSearchBar = async () => {
    await clearQueryParam(QueryParameter.SEARCHED_PEOPLE, $page.url);
  };

  let people = $state(data.people.people);
  $effect(() => {
    people = data.people.people;
  });
  let visiblePeople = $derived(people.filter((people) => !people.isHidden));
  let countVisiblePeople = $derived(searchName ? searchedPeopleLocal.length : data.people.total - data.people.hidden);
  let showPeople = $derived(searchName ? searchedPeopleLocal : visiblePeople);

  // const submitNameChange = (event: Event) => {
  //   event.preventDefault();
  //   if (searchPeopleElement) {
  //     handlePromiseError(searchPeopleElement.searchPeople(true, searchName));
  //   }
  // };
</script>

<svelte:window bind:innerHeight />

{#if showMergeModal && personMerge1 && personMerge2}
  <MergeSuggestionModal
    {personMerge1}
    {personMerge2}
    {potentialMergePeople}
    onClose={() => (showMergeModal = false)}
    onReject={changeName}
    onConfirm={handleMergeSamePerson}
  />
{/if}

<UserPageLayout
  title={$t('people')}
  description={countVisiblePeople === 0 && !searchName ? undefined : `(${countVisiblePeople.toLocaleString($locale)})`}
  use={[
    [
      scrollMemory,
      {
        routeStartsWith: AppRoute.PEOPLE,
        beforeSave: () => {
          if (currentPage) {
            sessionStorage.setItem(SessionStorageKey.INFINITE_SCROLL_PAGE, currentPage.toString());
          }
        },
        beforeClear: () => {
          sessionStorage.removeItem(SessionStorageKey.INFINITE_SCROLL_PAGE);
        },
        beforeLoad: loadInitialScroll,
      },
    ],
  ]}
>
  {#snippet buttons()}
    {#if people.length > 0}
      <div class="flex gap-2 items-center justify-center">
        <div class="hidden sm:block">
          <div class="w-40 lg:w-80 h-10">
            <SearchPeople
              bind:this={searchPeopleElement}
              type="searchBar"
              placeholder={$t('search_people')}
              onReset={onResetSearchBar}
              onSearch={handleSearch}
              bind:searchName
              bind:searchedPeopleLocal
            />
          </div>
        </div>
        <Button
          leadingIcon={mdiEyeOutline}
          onclick={() => (selectHidden = !selectHidden)}
          size="small"
          variant="ghost"
          color="secondary">{$t('show_and_hide_people')}</Button
        >
      </div>
    {/if}
  {/snippet}

  {#if countVisiblePeople > 0 && (!searchName || searchedPeopleLocal.length > 0)}
    <PeopleInfiniteScroll people={showPeople} hasNextPage={!!nextPage && !searchName} {loadNextPage}>
      {#snippet children({ person, index })}
        <PeopleCard
          {person}
          preload={index < 20}
          onChangeName={() => handleChangeName(person)}
          onSetBirthDate={() => handleSetBirthDate(person)}
          onMergePeople={() => handleMergePeople(person)}
          onHidePerson={() => handleHidePerson(person)}
          onToggleFavorite={() => handleToggleFavorite(person)}
        />
      {/snippet}
    </PeopleInfiniteScroll>
  {:else}
    <div class="flex min-h-[calc(66vh_-_11rem)] w-full place-content-center items-center dark:text-white">
      <div class="flex flex-col content-center items-center text-center">
        <Icon path={mdiAccountOff} size="3.5em" />
        <p class="mt-5 text-3xl font-medium max-w-lg line-clamp-2 overflow-hidden">
          {$t(searchName ? 'search_no_people_named' : 'search_no_people', { values: { name: searchName } })}
        </p>
      </div>
    </div>
  {/if}

  {#if showChangeNameModal}
    <FullScreenModal title={$t('change_name')} onClose={() => (showChangeNameModal = false)}>
      <form onsubmit={submitNameChange} autocomplete="off" id="change-name-form">
        <div class="flex flex-col gap-2">
          <label class="immich-form-label" for="name">{$t('name')}</label>
          <input
            class="immich-form-input"
            id="name"
            name="name"
            type="text"
            bind:value={personName}
            bind:this={changeNameInputEl}
          />
        </div>
      </form>

      {#snippet stickyBottom()}
        <Button
          color="secondary"
          fullWidth
          onclick={() => {
            showChangeNameModal = false;
          }}>{$t('cancel')}</Button
        >
        <Button type="submit" fullWidth form="change-name-form">{$t('ok')}</Button>
      {/snippet}
    </FullScreenModal>
  {/if}

  {#if showSetBirthDateModal}
    <SetBirthDateModal
      birthDate={edittingPerson?.birthDate ?? ''}
      onClose={() => (showSetBirthDateModal = false)}
      onUpdate={submitBirthDateChange}
    />
  {/if}
</UserPageLayout>

{#if selectHidden}
  <section
    transition:fly={{ y: innerHeight, duration: 150, easing: quintOut, opacity: 0 }}
    class="absolute left-0 top-0 z-[9999] h-full w-full bg-immich-bg dark:bg-immich-dark-bg"
    role="dialog"
    aria-modal="true"
    aria-labelledby="manage-visibility-title"
    use:focusTrap
  >
    <ManagePeopleVisibility
      bind:people
      totalPeopleCount={data.people.total}
      titleId="manage-visibility-title"
      onClose={() => (selectHidden = false)}
      {loadNextPage}
    />
  </section>
{/if}
